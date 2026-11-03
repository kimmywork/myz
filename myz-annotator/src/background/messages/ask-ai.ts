/**
 * Background side of the 解读 hand-off (toolbar → external AI chat).
 *
 * Resolves the chat tab next to the page the user is reading, starts a fresh
 * conversation when the tab is sitting in an old one, renders the prompt from
 * the user's template in settings, and hands both to the chat tab's content
 * script (`myz:aiCompose`).
 *
 * Chrome 155+ exposes the Split View API (`tabs.createSplit` / `create({
 * splitWithTabId })`), so the chat opens *beside* the source page instead of
 * replacing it: the reading context stays on screen. Older browsers (and the
 * cases split view cannot express: grouped/pinned tabs, cross-window tabs, a
 * source page that is already a pane) fall back to activating the tab.
 *
 * Delivery is retried rather than awaited once: a freshly opened tab, or one
 * that was just navigated back to the new-chat URL, needs a moment before the
 * content script (injected at `document_idle`) can answer.
 */
import type { MessageContext } from "@myz/shared/messageRegistry";
import { sendMessageToTab } from "@myz/shared/messaging";
import {
  readAiSession,
  shouldReuseSession,
  writeAiSession,
} from "../ai/session.js";
import type { AiChatSession } from "../ai/session.js";
import { notifier } from "../runtime.js";
import { readSettings } from "../storage.js";
import { registerMessageHandler } from "./handler";
import { renderAiPrompt } from "@/ai/prompt";
import { getAiProvider } from "@/ai/providers";
import { isProviderNewChatUrl } from "@/ai/providers";
import type { AiProvider } from "@/ai/providers";
import { normalizeAiSettings } from "@/ai/settings";
import type {
  AiComposePayload,
  AiComposeResult,
} from "@/content/ai-compose.js";
import type { AiAskPayload } from "@/content/ai-compose.js";

const DELIVERY_TIMEOUT_MS = 20_000;
const DELIVERY_POLL_MS = 400;
const NAVIGATION_TIMEOUT_MS = 15_000;
const NAVIGATION_POLL_MS = 150;
const MAX_IMAGES = 4;
/** `Tab.splitViewId` of a tab that is not part of a split view. */
const NO_SPLIT_VIEW = -1;
/** Don't nag on every click while the user is still logged out. */
const LOGIN_NOTICE_COOLDOWN_MS = 60_000;

interface ComposeEnvelope {
  ok?: boolean;
  data?: AiComposeResult;
  error?: string;
}

/**
 * Split View API surface (Chrome 155+) that `@types/chrome` does not declare
 * yet. Feature-detected at call time, never assumed.
 */
interface SplitViewTabs {
  createSplit?: (tabIds: number[]) => Promise<number>;
}

let lastLoginNoticeAt = 0;

export function initializeAskAiMessageHandlers() {
  registerMessageHandler(
    "myz:askAi",
    async (
      payload: AiAskPayload,
      ctx: MessageContext,
    ): Promise<AiComposeResult> => {
      const text = (payload?.text ?? "").trim();
      const images = (payload?.images ?? []).slice(0, MAX_IMAGES);
      if (!text && !images.length) {
        return { ok: false, reason: "empty-payload" };
      }

      const ai = normalizeAiSettings((await readSettings()).ai);
      const provider = getAiProvider(ai.provider);
      if (!provider.available) {
        return { ok: false, reason: "provider-unavailable" };
      }

      const prompt = renderAiPrompt({
        template: ai.promptTemplate,
        text,
        url: payload?.url ?? "",
      });
      const source = await getTab(ctx.tabId);
      const { tab, newChat } = await resolveChatTab(provider, source);
      if (!tab?.id) {
        return { ok: false, reason: "timeout" };
      }
      const payloadForTab: AiComposePayload = {
        prompt,
        provider: provider.id,
        images,
        expectNewChat: newChat,
      };
      let result = await deliver(tab.id, payloadForTab);
      // The page could not switch conversations itself (no known control): fall
      // back to a real navigation and only then fill. Re-checking the URL after
      // the reload is what keeps the prompt out of the outgoing conversation.
      if (result.reason === "not-ready") {
        await navigateToNewChat(tab.id, provider);
        result = await deliver(tab.id, payloadForTab);
      }
      if (result.reason === "login-required") {
        await notifyLoginRequired(provider);
      }
      if (result.ok) {
        await rememberSession(source, tab);
      }
      return result;
    },
  );
}

/**
 * The chat tab is already in front when this fires, so a page toast would be
 * invisible: use a system notification instead (throttled).
 */
async function notifyLoginRequired(provider: AiProvider): Promise<void> {
  const now = Date.now();
  if (now - lastLoginNoticeAt < LOGIN_NOTICE_COOLDOWN_MS) return;
  lastLoginNoticeAt = now;
  try {
    await notifier.notify({
      id: "myz-ai-login",
      title: `MyZ：需要登录 ${provider.label}`,
      message: `请先在 ${provider.label} 标签页登录，然后重新选中内容再试。`,
    });
  } catch (error) {
    console.debug("MyZ: login notification failed", error);
  }
}

/**
 * Find or create the provider's chat tab. A recorded session is honoured only
 * when source tab, source URL, chat tab and chat URL all still match; otherwise
 * an existing conversation is reset to a new chat, exactly as before.
 */
export async function resolveChatTab(
  provider: AiProvider,
  source: chrome.tabs.Tab | null,
): Promise<{ tab: chrome.tabs.Tab | null; newChat: boolean }> {
  const session = await readAiSession(source?.id);
  const existing = await findChatTab(provider, session, source);
  const reusable =
    existing?.id != null &&
    session !== null &&
    shouldReuseSession(
      session,
      {
        sourceTabId: source?.id ?? -1,
        sourceUrl: source?.url ?? "",
        chatTabId: existing.id,
        chatUrl: existing.url ?? "",
      },
      provider,
    );

  if (reusable && existing) {
    return { tab: await showBesideSource(existing, source), newChat: false };
  }

  const tab = existing ?? (await openChatTab(provider, source));
  if (!tab?.id) return { tab: null, newChat: false };
  // The conversation switch happens in the chat tab (in-page control first), so
  // that a slow-booting SPA is not reloaded; the content script refuses to fill
  // until it really is on a new chat.
  return { tab: await showBesideSource(tab, source), newChat: true };
}

/**
 * Record what we just filled so the next click on this page can continue the
 * same conversation. The URL is re-read after composing because the site may
 * have canonicalised it.
 */
async function rememberSession(
  source: chrome.tabs.Tab | null,
  chatTab: chrome.tabs.Tab,
): Promise<void> {
  if (!source?.id || chatTab.id == null) return;
  const fresh = await getTab(chatTab.id);
  await writeAiSession({
    sourceTabId: source.id,
    sourceUrl: source.url ?? "",
    chatTabId: chatTab.id,
    chatUrl: fresh?.url ?? chatTab.url ?? "",
    updatedAt: Date.now(),
  });
}

async function getTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  if (tabId == null) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

/**
 * Pick the chat tab to use, in order:
 *   1. a pane already showing this provider next to the reader's page (it is
 *      right in front of the user — reuse the view, never open another tab);
 *   2. the tab this source page was talking to before;
 *   3. the active one;
 *   4. the most recent one.
 */
export function pickChatTab(
  tabs: chrome.tabs.Tab[],
  session: AiChatSession | null,
  source: chrome.tabs.Tab | null,
): chrome.tabs.Tab | null {
  if (!tabs.length) return null;
  const pane = source
    ? tabs.find((tab) => isSplitTogether(tab, source))
    : undefined;
  if (pane) return pane;
  const own = session
    ? tabs.find((tab) => tab.id === session.chatTabId)
    : undefined;
  return own ?? tabs.find((tab) => tab.active) ?? tabs[tabs.length - 1] ?? null;
}

async function findChatTab(
  provider: AiProvider,
  session: AiChatSession | null,
  source: chrome.tabs.Tab | null,
): Promise<chrome.tabs.Tab | null> {
  const tabs = (await chrome.tabs.query({})).filter((tab) =>
    provider.hostPattern.test(tab.url ?? ""),
  );
  return pickChatTab(tabs, session, source);
}

/** Open a new chat tab; beside the source page when split view is available. */
async function openChatTab(
  provider: AiProvider,
  source: chrome.tabs.Tab | null,
): Promise<chrome.tabs.Tab | null> {
  const url = provider.newChatUrl;
  if (source?.id != null && supportsSplitView()) {
    try {
      const splitOptions = { url, active: true, splitWithTabId: source.id };
      return await chrome.tabs.create(
        splitOptions as chrome.tabs.CreateProperties,
      );
    } catch (error) {
      console.debug("MyZ: chat split tab creation failed", error);
    }
  }
  return chrome.tabs.create({ url, active: true });
}

/**
 * Last-resort conversation switch: when the chat page has no usable in-page
 * "new chat" control, navigate it to the provider's new-chat URL and wait for
 * the *new document* before anything is written. Waiting is what prevents the
 * prompt from landing in the conversation being left behind.
 */
async function navigateToNewChat(
  tabId: number,
  provider: AiProvider,
): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { url: provider.newChatUrl });
  } catch (error) {
    console.debug("MyZ: chat new-chat navigation failed", error);
    return;
  }
  const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tab = await getTab(tabId);
    if (
      tab &&
      tab.status === "complete" &&
      isProviderNewChatUrl(provider, tab.url)
    ) {
      return;
    }
    await delay(NAVIGATION_POLL_MS);
  }
  console.debug("MyZ: chat new-chat navigation timed out");
}

/**
 * Bring the chat tab into view without losing the reader's page: prefer a split
 * view with `source`, otherwise focus the tab as before.
 */
async function showBesideSource(
  tab: chrome.tabs.Tab,
  source: chrome.tabs.Tab | null,
): Promise<chrome.tabs.Tab> {
  if (source && tab.id != null && source.id != null) {
    const [freshTab, freshSource] = await Promise.all([
      getTab(tab.id),
      getTab(source.id),
    ]);
    if (freshTab && freshSource && !isSplitTogether(freshTab, freshSource)) {
      await splitWith(freshTab, freshSource);
    }
  }
  await activate(tab);
  return tab;
}

async function activate(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id != null) {
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (error) {
      console.debug("MyZ: chat tab activation failed", error);
    }
  }
  if (tab.windowId != null) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      console.debug("MyZ: chat window focus failed", error);
    }
  }
}

function supportsSplitView(): boolean {
  const runtime = globalThis as { chrome?: { tabs?: SplitViewTabs } };
  return typeof runtime.chrome?.tabs?.createSplit === "function";
}

function tabsApi(): SplitViewTabs & typeof chrome.tabs {
  return chrome.tabs as SplitViewTabs & typeof chrome.tabs;
}

function splitViewIdOf(tab: chrome.tabs.Tab): number {
  return tab.splitViewId ?? NO_SPLIT_VIEW;
}

/** True when both tabs are the two panes of the same split view. */
export function isSplitTogether(
  tab: chrome.tabs.Tab,
  source: chrome.tabs.Tab,
): boolean {
  const splitViewId = splitViewIdOf(tab);
  return splitViewId !== NO_SPLIT_VIEW && splitViewId === splitViewIdOf(source);
}

/**
 * Split view cannot express every tab arrangement: both tabs must be free
 * (a tab belongs to at most one split), live in the same window, and share the
 * pin/group state. Anything else keeps the old "just focus the tab" behaviour.
 */
export function canSplitWith(
  tab: chrome.tabs.Tab,
  source: chrome.tabs.Tab,
): boolean {
  if (!supportsSplitView()) return false;
  if (tab.id == null || source.id == null) return false;
  if (tab.id === source.id) return false;
  if (tab.windowId !== source.windowId) return false;
  if (tab.pinned !== source.pinned) return false;
  if ((tab.groupId ?? -1) !== (source.groupId ?? -1)) return false;
  return (
    splitViewIdOf(tab) === NO_SPLIT_VIEW &&
    splitViewIdOf(source) === NO_SPLIT_VIEW
  );
}

/** Pair two tabs, moving them adjacent first (the API requires it). */
async function splitWith(
  tab: chrome.tabs.Tab,
  source: chrome.tabs.Tab,
): Promise<boolean> {
  if (!canSplitWith(tab, source)) return false;
  try {
    await makeAdjacent(tab, source);
    await tabsApi().createSplit?.([source.id as number, tab.id as number]);
    return true;
  } catch (error) {
    console.debug("MyZ: chat split view failed", error);
    return false;
  }
}

async function makeAdjacent(
  tab: chrome.tabs.Tab,
  source: chrome.tabs.Tab,
): Promise<void> {
  if (tab.id == null || source.id == null) return;
  const current = await chrome.tabs.get(tab.id);
  const anchor = await chrome.tabs.get(source.id);
  if (Math.abs((current.index ?? 0) - (anchor.index ?? 0)) === 1) return;
  await chrome.tabs.move(tab.id, { index: (anchor.index ?? 0) + 1 });
}

async function deliver(
  tabId: number,
  payload: AiComposePayload,
): Promise<AiComposeResult> {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
  let last: AiComposeResult = { ok: false, reason: "timeout" };
  while (Date.now() < deadline) {
    try {
      const response = await sendMessageToTab<
        "myz:aiCompose",
        AiComposePayload,
        ComposeEnvelope
      >(tabId, "myz:aiCompose", payload);
      const result = response?.data;
      if (response?.ok && result?.ok) {
        return result;
      }
      last = result ?? { ok: false, reason: "timeout" };
      // A logged-out tab will never grow a composer, and `not-ready` needs a
      // navigation decision from the caller: stop retrying both.
      if (
        last.reason === "login-required" ||
        last.reason === "empty-payload" ||
        last.reason === "not-ready"
      ) {
        return last;
      }
    } catch (error) {
      // "Receiving end does not exist" while the tab loads: retry.
      last = { ok: false, reason: "timeout" };
      console.debug("MyZ: chat compose not delivered yet", error);
    }
    await delay(DELIVERY_POLL_MS);
  }
  return last;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
