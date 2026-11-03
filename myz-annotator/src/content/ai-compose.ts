/**
 * AI chat composer bridge.
 *
 * The toolbar's 解读 action forwards a selection (text + an optional screenshot)
 * from the page the user is reading to an external chat tab. The background
 * renders the prompt, opens/focuses that tab and calls `myz:aiCompose`; this
 * module runs inside the chat page and fills the composer.
 *
 * Everything here is selector-heuristic based because the sites ship hashed
 * class names and several UI languages: the composer is found by shape (largest
 * visible textarea / editable region), never by placeholder text. Provider
 * specifics (sign-in path, mode toggles) come from `@/ai/providers`.
 *
 * The composer is only filled, never submitted — the user reviews and sends.
 */
import {
  getAiProvider,
  isProviderLoginUrl,
  isProviderNewChatUrl,
} from "@/ai/providers";
import type { AiProvider, AiProviderId } from "@/ai/providers";

/** One image attached to a compose request, already encoded as a data URL. */
export interface AiComposeImage {
  dataUrl: string;
  mime: string;
}

/** Toolbar → background: the raw selection, rendered later by settings. */
export interface AiAskPayload {
  /** Selected text, paragraph-separated; may be empty for image-only picks. */
  text: string;
  /** Page the excerpt came from. */
  url: string;
  images?: AiComposeImage[];
}

/** Background → chat tab: the finished prompt plus the provider to fill. */
export interface AiComposePayload {
  prompt: string;
  provider: AiProviderId;
  images?: AiComposeImage[];
  /**
   * The chat tab must be showing a fresh conversation before anything is
   * written. The content script switches (in-page button first) and refuses to
   * fill otherwise, so a slow navigation can never dump the prompt into the
   * conversation that is being left behind.
   */
  expectNewChat?: boolean;
}

/** Result of a compose attempt, shared by the background and content sides. */
export interface AiComposeResult {
  ok: boolean;
  reason?:
    | "login-required"
    | "composer-missing"
    | "empty-payload"
    | "provider-unavailable"
    /** Still on the old conversation; the background must navigate first. */
    | "not-ready"
    | "timeout";
  /** Number of images the composer accepted. */
  attached?: number;
  /** Number of images that could not be attached. */
  skipped?: number;
}

const COMPOSER_TIMEOUT_MS = 8_000;
const COMPOSER_POLL_MS = 250;
const ATTACH_SETTLE_MS = 700;
const TEXT_SETTLE_MS = 150;

/** Fill the chat composer with `payload` and report what happened. */
export async function composeInChat(
  payload: AiComposePayload,
): Promise<AiComposeResult> {
  const prompt = (payload?.prompt ?? "").trim();
  if (!prompt) {
    return { ok: false, reason: "empty-payload" };
  }
  const provider = getAiProvider(payload.provider);
  // Check the sign-in screen before polling: a logged-out tab has no composer
  // at all, so waiting for one would only end in a generic timeout.
  if (isProviderLoginUrl(provider, location.href)) {
    return { ok: false, reason: "login-required" };
  }
  // A new conversation must exist *before* anything is written: switching is
  // asynchronous, and filling the outgoing conversation would lose the prompt.
  if (payload.expectNewChat && !(await ensureNewChat(provider))) {
    return { ok: false, reason: "not-ready" };
  }
  const composer = await waitForComposer(COMPOSER_TIMEOUT_MS);
  if (!composer) {
    return {
      ok: false,
      reason: isProviderLoginUrl(provider, location.href)
        ? "login-required"
        : "composer-missing",
    };
  }

  composer.focus();
  await ensureThinking(provider);
  const images = Array.isArray(payload.images) ? payload.images : [];
  let attached = 0;
  for (const [index, image] of images.entries()) {
    if (await attachImage(composer, image, index)) {
      attached += 1;
      await delay(ATTACH_SETTLE_MS);
    }
  }
  await setComposerText(composer, prompt);
  composer.focus();

  return { ok: true, attached, skipped: images.length - attached };
}

// ── New conversation ────────────────────────────────────────────────────────

const NEW_CHAT_TIMEOUT_MS = 5_000;
const NEW_CHAT_SETTLE_MS = 600;

/**
 * Make sure the page is on a fresh conversation, in this order:
 *   1. click the app's own "new chat" control (SPA route change, no reload);
 *   2. drive the router directly (`pushState` + `popstate`) and verify the view
 *      really changed — some apps have no selectable control (hashed classes,
 *      localized labels) but do honour history events;
 *   3. give up with `false`, and let the background navigate to the new-chat URL.
 *
 * Nothing is written unless one of these is verified, so a slow or ignored
 * switch can never spill into the conversation that is being left behind.
 */
async function ensureNewChat(provider: AiProvider): Promise<boolean> {
  if (isProviderNewChatUrl(provider, location.href)) return true;

  if (clickNewChatControl(provider)) {
    if (await waitForNewChat(provider, NEW_CHAT_TIMEOUT_MS)) {
      // Let the route render: the outgoing conversation's composer is still in
      // the DOM for a moment after the URL changes.
      await delay(NEW_CHAT_SETTLE_MS);
      return true;
    }
  }

  const beforePath = `${location.pathname}${location.search}`;
  const beforeText = document.body.innerText.trim();
  const beforeComposer = findComposer();
  if (pushNewChatRoute(provider)) {
    const switched = await waitForNewChatView(
      provider,
      beforeText,
      beforeComposer,
      NEW_CHAT_TIMEOUT_MS,
    );
    if (switched) {
      await delay(NEW_CHAT_SETTLE_MS);
      return true;
    }
    restoreRoute(beforePath);
  }

  return isProviderNewChatUrl(provider, location.href);
}

function clickNewChatControl(provider: AiProvider): boolean {
  for (const selector of provider.newChatControl ?? []) {
    const control = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    ).find(isVisible);
    if (control) {
      control.click();
      return true;
    }
  }
  return false;
}

/**
 * Drive the SPA router: `pushState` alone does not notify most routers, so a
 * `popstate` is dispatched right after it. Returns false when the new-chat URL
 * is not same-origin (never happens for a configured provider).
 */
function pushNewChatRoute(provider: AiProvider): boolean {
  try {
    const target = new URL(provider.newChatUrl);
    if (target.origin !== location.origin) return false;
    history.pushState({}, "", `${target.pathname}${target.search}`);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    return true;
  } catch (error) {
    console.debug("MyZ: new-chat route push failed", error);
    return false;
  }
}

function restoreRoute(path: string): void {
  try {
    history.replaceState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  } catch (error) {
    console.debug("MyZ: new-chat route restore failed", error);
  }
}

/**
 * A route change is only trusted once the view proves it: the page text changed
 * (the conversation is gone) or the composer element was replaced. An app that
 * ignored the event leaves everything identical, so the caller restores the URL
 * and falls back to a real navigation.
 */
async function waitForNewChatView(
  provider: AiProvider,
  beforeText: string,
  beforeComposer: HTMLElement | null,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isProviderNewChatUrl(provider, location.href)) {
      const textChanged = document.body.innerText.trim() !== beforeText;
      const composerSwapped =
        beforeComposer !== null && findComposer() !== beforeComposer;
      if (textChanged || composerSwapped) return true;
    }
    await delay(150);
  }
  return false;
}

async function waitForNewChat(
  provider: AiProvider,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isProviderNewChatUrl(provider, location.href)) return true;
    await delay(150);
  }
  return isProviderNewChatUrl(provider, location.href);
}

// ── Mode toggles ────────────────────────────────────────────────────────────

/**
 * Switch the provider's "deep thinking" mode on before composing: reading an
 * excerpt benefits from it, and the mode is remembered by the site anyway, so
 * keeping it on is the least surprising state.
 *
 * The buttons are matched by label (multi-language) and, failing that, by
 * elimination against the other mode button — never by hashed class names.
 */
async function ensureThinking(provider: AiProvider): Promise<boolean> {
  const config = provider.thinkToggle;
  if (!config) return false;
  const toggle = findThinkToggle(config.selector, config.label, config.exclude);
  if (!toggle) return false;
  if (toggle.getAttribute("aria-pressed") === "true") return true;
  toggle.click();
  await delay(300);
  return toggle.getAttribute("aria-pressed") === "true";
}

function findThinkToggle(
  selector: string,
  label: RegExp,
  exclude?: RegExp,
): HTMLElement | null {
  const toggles = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const text = (element: HTMLElement) => element.textContent ?? "";
  const target = toggles.find((toggle) => label.test(text(toggle)));
  if (target) return target;
  if (!exclude) return null;
  const other = toggles.find((toggle) => exclude.test(text(toggle)));
  return other ? (toggles.find((toggle) => toggle !== other) ?? null) : null;
}

// ── Composer discovery ──────────────────────────────────────────────────────

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

/**
 * The composer is the largest visible text area on the chat page: it sits at
 * the bottom of the viewport, while other inputs (search, rename) are small.
 */
export function findComposer(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'textarea, [contenteditable="true"], [role="textbox"]',
    ),
  ).filter(isVisible);
  if (!candidates.length) return null;
  const area = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  };
  return candidates.sort((a, b) => area(b) - area(a))[0] ?? null;
}

async function waitForComposer(timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const composer = findComposer();
    if (composer) return composer;
    await delay(COMPOSER_POLL_MS);
  }
  return null;
}

// ── Text insertion ──────────────────────────────────────────────────────────

/**
 * Write `text` into the composer. React-style inputs keep their own value
 * tracker, so a plain `element.value = text` is ignored on re-render; calling
 * the prototype setter directly keeps the tracker in sync and lets the
 * framework see a real change.
 */
async function setComposerText(
  composer: HTMLElement,
  text: string,
): Promise<void> {
  if (
    composer instanceof HTMLTextAreaElement ||
    composer instanceof HTMLInputElement
  ) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(composer) as object,
      "value",
    )?.set;
    if (setter) {
      setter.call(composer, text);
    } else {
      composer.value = text;
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // Rich-text editors (ProseMirror/Lexical/Slate) accept synthetic paste
  // events, which keeps their internal document model in sync.
  composer.focus();
  // Follow-ups always replace the draft (product decision): selecting first
  // makes the paste/insertText land on top of the old text instead of after it.
  if ((composer.textContent ?? "").trim()) {
    document.execCommand("selectAll", false);
  }
  dispatchPaste(composer, { text });
  await delay(TEXT_SETTLE_MS);
  if (!(composer.textContent ?? "").includes(text.slice(0, 16))) {
    document.execCommand("insertText", false, text);
  }
}

// ── Image attachment ────────────────────────────────────────────────────────

/**
 * Attach one image. Two strategies, both of which the chat apps treat as a user
 * paste/upload:
 *   1. a `paste` event carrying the file in its clipboard data;
 *   2. assigning the file to the app's hidden `input[type=file]`.
 * The paste handler returns `false` when the app consumed the event.
 */
async function attachImage(
  composer: HTMLElement,
  image: AiComposeImage,
  index: number,
): Promise<boolean> {
  const file = dataUrlToFile(image, index);
  if (!file) return false;
  const consumed = dispatchPaste(composer, { file });
  if (consumed) return true;
  return assignFileInput(file, image.mime);
}

function assignFileInput(file: File, mime: string): boolean {
  const input = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ).find((candidate) => acceptsMime(candidate, mime));
  if (!input) return false;
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (error) {
    console.warn("MyZ: chat file input attach failed", error);
    return false;
  }
}

function acceptsMime(input: HTMLInputElement, mime: string): boolean {
  const accept = (input.accept ?? "").trim();
  if (!accept) return true;
  const family = mime.split("/")[0];
  return accept.split(",").some((entry) => {
    const token = entry.trim().toLowerCase();
    return token === mime || token === `${family}/*` || token.startsWith(".");
  });
}

/**
 * Dispatch a synthetic `paste` event. Returns `true` when the page called
 * `preventDefault()`, i.e. it took the payload.
 */
function dispatchPaste(
  composer: HTMLElement,
  content: { text?: string; file?: File },
): boolean {
  if (
    typeof ClipboardEvent === "undefined" ||
    typeof DataTransfer === "undefined"
  ) {
    return false;
  }
  const transfer = new DataTransfer();
  if (content.file) transfer.items.add(content.file);
  if (content.text) transfer.setData("text/plain", content.text);
  const event = new ClipboardEvent("paste", {
    clipboardData: transfer,
    bubbles: true,
    cancelable: true,
  });
  return composer.dispatchEvent(event) === false;
}

function dataUrlToFile(image: AiComposeImage, index: number): File | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(
    image.dataUrl ?? "",
  );
  if (!match) return null;
  const mime = image.mime || match[1] || "image/png";
  try {
    const bytes = match[2]
      ? base64ToBytes(match[3])
      : new TextEncoder().encode(decodeURIComponent(match[3]));
    return new File(
      [bytes],
      `myz-selection-${index + 1}${extensionFor(mime)}`,
      {
        type: mime,
      },
    );
  } catch (error) {
    console.warn("MyZ: chat image decode failed", error);
    return null;
  }
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionFor(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".png";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
