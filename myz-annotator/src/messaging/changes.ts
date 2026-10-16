import type { ChangeBus, ChangeDomain, ChangeEvent } from "@myz/core/changes";

/**
 * Extension implementation of the {@link ChangeBus} port.
 *
 * Two channels so every extension context is covered:
 * - `BroadcastChannel` for extension pages + service worker (same origin);
 * - `chrome.storage.onChanged` as a fallback for contexts where
 *   `BroadcastChannel` is unavailable or origin-scoped (content scripts).
 */
const CHANNEL_NAME = "myz:changes";
const STORAGE_KEY = "myz::changes";

/** `chrome` is absent outside the extension; access it defensively. */
function chromeApi(): typeof chrome | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome;
}

function newEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidDomain(value: unknown): value is ChangeDomain {
  return (
    value === "records" ||
    value === "inbox" ||
    value === "settings" ||
    value === "sync"
  );
}

function normalizeEvent(raw: unknown): ChangeEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<ChangeEvent>;
  if (!isValidDomain(candidate.domain)) return null;
  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : newEventId(),
    domain: candidate.domain,
    ids: Array.isArray(candidate.ids) ? candidate.ids : undefined,
    at: typeof candidate.at === "number" ? candidate.at : Date.now(),
  };
}

/** Cap on remembered event ids, so an active page does not grow unbounded. */
const SEEN_ID_LIMIT = 200;

export function createChangeBus(): ChangeBus {
  const listeners = new Set<(event: ChangeEvent) => void>();
  const seenIds = new Set<string>();
  let channel: BroadcastChannel | null = null;
  let storageHandler: ((changes: unknown, area: string) => void) | null = null;

  /** Deduplicate an event delivered on more than one channel. */
  function isDuplicate(id: string): boolean {
    if (seenIds.has(id)) return true;
    seenIds.add(id);
    if (seenIds.size > SEEN_ID_LIMIT) {
      const oldest = seenIds.values().next().value;
      if (oldest !== undefined) seenIds.delete(oldest);
    }
    return false;
  }

  function emit(event: ChangeEvent): void {
    if (isDuplicate(event.id)) return;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.warn("MyZ: change listener failed", error);
      }
    }
  }

  function ensureChannel(): BroadcastChannel | null {
    if (channel || typeof BroadcastChannel === "undefined") return channel;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (message: MessageEvent) => {
      const event = normalizeEvent(message.data);
      if (event) emit(event);
    };
    return channel;
  }

  function ensureStorageListener(): void {
    if (storageHandler) return;
    const onChanged = chromeApi()?.storage?.onChanged;
    if (!onChanged) return;
    storageHandler = (changes, area) => {
      const map = changes as Record<string, { newValue?: unknown }> | undefined;
      if (area !== "local" || !map?.[STORAGE_KEY]) return;
      const event = normalizeEvent(map[STORAGE_KEY]?.newValue);
      if (event) emit(event);
    };
    onChanged.addListener(storageHandler);
  }

  return {
    publish(event) {
      const full: ChangeEvent = { ...event, id: newEventId(), at: Date.now() };
      try {
        ensureChannel()?.postMessage(full);
      } catch (error) {
        console.warn("MyZ: BroadcastChannel publish failed", error);
      }
      try {
        void chromeApi()?.storage?.local?.set?.({ [STORAGE_KEY]: full });
      } catch (error) {
        console.warn("MyZ: storage publish failed", error);
      }
    },
    subscribe(listener) {
      ensureChannel();
      ensureStorageListener();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Shared bus for extension contexts. */
export const changeBus = createChangeBus();
