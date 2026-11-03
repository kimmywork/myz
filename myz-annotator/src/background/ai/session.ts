/**
 * "Keep talking to the same conversation" memory for the 解读 hand-off.
 *
 * Clicking 解读 twice on the same page should land in the conversation the user
 * already has open (so the model keeps the previous excerpt/screenshot in
 * context) instead of reloading the chat tab into a fresh one. The only way to
 * tell "our conversation" from "some conversation the user opened themselves" is
 * to remember what we did, so exactly three facts are stored per source tab:
 *
 *   - source tab id + source tab URL (where the excerpt came from),
 *   - the chat tab id + the chat URL we filled last time.
 *
 * Any change to those (or a TTL expiry) means "start over". Completed sends move
 * the chat tab from `/` to `/a/chat/s/<id>`; that one transition is accepted as
 * the same conversation (see {@link shouldReuseSession}) and recorded so later
 * clicks compare against the conversation URL.
 *
 * State lives in `chrome.storage.session`: gone on browser restart, survives
 * service-worker suspension, and never leaks excerpts (only URLs and tab ids).
 */
import {
  chatLocationKey,
  isProviderLoginUrl,
  isProviderNewChatUrl,
} from "@/ai/providers";
import type { AiProvider } from "@/ai/providers";

const STORAGE_KEY = "myz::ai-session";
/** How long a recorded conversation stays eligible for follow-ups. */
export const AI_SESSION_TTL_MS = 30 * 60 * 1000;

export interface AiChatSession {
  sourceTabId: number;
  sourceUrl: string;
  chatTabId: number;
  /** Chat tab URL we filled (root right after a new chat, conversation later). */
  chatUrl: string;
  updatedAt: number;
}

/** The facts to compare against a stored session. */
export interface AiSessionSnapshot {
  sourceTabId: number;
  sourceUrl: string;
  chatTabId: number;
  chatUrl: string;
}

type SessionMap = Record<string, AiChatSession>;

/**
 * Reuse only when every recorded fact still matches. The single exception is the
 * root → conversation transition a completed send causes: the URL changes but it
 * is still the conversation we opened, so it is adopted (and re-recorded).
 */
export function shouldReuseSession(
  session: AiChatSession | null,
  current: AiSessionSnapshot,
  provider: AiProvider,
  now = Date.now(),
): boolean {
  if (!session) return false;
  if (now - session.updatedAt > AI_SESSION_TTL_MS) return false;
  if (session.sourceTabId !== current.sourceTabId) return false;
  if (session.sourceUrl !== current.sourceUrl) return false;
  if (session.chatTabId !== current.chatTabId) return false;
  // Every new-chat route counts as the same place (`/` vs `/c/new-chat`).
  if (
    chatLocationKey(provider, session.chatUrl) ===
    chatLocationKey(provider, current.chatUrl)
  ) {
    return true;
  }
  // Accepted transition: a completed send turns the new-chat URL into a
  // conversation URL, which is still the conversation we opened.
  return (
    isProviderNewChatUrl(provider, session.chatUrl) &&
    !isProviderNewChatUrl(provider, current.chatUrl) &&
    !isProviderLoginUrl(provider, current.chatUrl)
  );
}

function isSession(value: unknown): value is AiChatSession {
  const record = (value ?? {}) as Partial<AiChatSession>;
  return (
    typeof record.sourceTabId === "number" &&
    typeof record.sourceUrl === "string" &&
    typeof record.chatTabId === "number" &&
    typeof record.chatUrl === "string" &&
    typeof record.updatedAt === "number"
  );
}

/** Drop expired (and malformed) entries; exported for tests. */
export function pruneSessions(map: SessionMap, now = Date.now()): SessionMap {
  const pruned: SessionMap = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    if (!isSession(value)) continue;
    if (now - value.updatedAt > AI_SESSION_TTL_MS) continue;
    pruned[key] = value;
  }
  return pruned;
}

async function readMap(): Promise<SessionMap> {
  try {
    const stored = await chrome.storage.session.get(STORAGE_KEY);
    const map = stored?.[STORAGE_KEY];
    return map && typeof map === "object"
      ? pruneSessions(map as SessionMap)
      : {};
  } catch (error) {
    console.debug("MyZ: AI session read failed", error);
    return {};
  }
}

async function writeMap(map: SessionMap): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: map });
  } catch (error) {
    console.debug("MyZ: AI session write failed", error);
  }
}

export async function readAiSession(
  sourceTabId?: number,
): Promise<AiChatSession | null> {
  if (sourceTabId == null) return null;
  const map = await readMap();
  return map[String(sourceTabId)] ?? null;
}

export async function writeAiSession(session: AiChatSession): Promise<void> {
  const map = await readMap();
  map[String(session.sourceTabId)] = session;
  await writeMap(map);
}

/** Forget every session that pointed at `tabId` as source or as chat tab. */
export async function clearAiSessionsForTab(tabId: number): Promise<void> {
  const map = await readMap();
  let changed = false;
  for (const [key, value] of Object.entries(map)) {
    if (value.sourceTabId === tabId || value.chatTabId === tabId) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) await writeMap(map);
}
