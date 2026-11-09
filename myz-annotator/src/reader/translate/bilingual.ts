/**
 * Incremental bilingual translation session.
 *
 * A bilingual reader translates one *block* at a time (a PDF paragraph, an
 * EPUB `p`), only for the blocks fully inside the viewport, and asks for more
 * as the user scrolls. This module owns the scheduling that makes that safe:
 * de-duplication by text, one sequential batch at a time (the Translator API is
 * strictly serial), cancellation when the target language changes, remembered
 * source language so later batches skip detection, and replay of the last
 * request after a target change or a retry.
 *
 * Pure logic over the injected engine/cache — the DOM panes live in
 * `reader/bilingual-pane.ts` and subscribe to the events published here.
 */

import type { TextHasher, TranslationCache } from "./cache.js";
import { normalizeLanguageTag, resolveTargetLanguage } from "./language.js";
import {
  TranslationError,
  translateText,
  type TranslationBlockResult,
  type TranslationProgress,
} from "./service.js";
import type { TranslationEngine } from "./types.js";

export type BilingualPhase =
  "idle" | "detecting" | "downloading" | "translating" | "ready" | "error";

export interface BilingualSegment {
  /** Stable identity of the source block (usually its normalized text). */
  key: string;
  text: string;
}

export interface BilingualSnapshot {
  phase: BilingualPhase;
  sourceLanguage: string;
  targetLanguage: string;
  error: string;
  /** Blocks translated for the current target. */
  translated: number;
  /** Blocks requested but not translated yet. */
  pending: number;
  /** Language-pack download progress in the 0..1 range. */
  downloadProgress: number;
}

export type BilingualEvent =
  | { type: "state"; snapshot: BilingualSnapshot }
  | { type: "block"; key: string; translation: string }
  | { type: "reset" };

export interface BilingualSessionOptions {
  engine: TranslationEngine | null;
  /**
   * Resolves the engine on every request. Readers pass this because the
   * session is created before anything is translated (a persisted-enabled mode
   * is already on at boot) and the test harness installs its mock engine after
   * the page loaded — a one-off `engine` captured at construction would be
   * stale (and report "unsupported").
   */
  engineProvider?: () => TranslationEngine | null;
  cache?: TranslationCache | null;
  hasher?: TextHasher;
  targetLanguage?: string;
}

export interface BilingualSession {
  /** Queues the blocks that are visible now; unknown ones are translated. */
  request(segments: BilingualSegment[]): void;
  /** Cancels in-flight work and forgets the queue (used when disabling). */
  cancel(): void;
  setTargetLanguage(tag: string): void;
  /** Re-runs detection and retranslates everything for the current target. */
  redetect(): void;
  retry(): void;
  translationFor(key: string): string | undefined;
  snapshot(): BilingualSnapshot;
  subscribe(listener: (event: BilingualEvent) => void): () => void;
  dispose(): void;
}

function messageFor(error: unknown): string {
  if (error instanceof TranslationError) {
    return error.code === "aborted" ? "" : error.message;
  }
  return "翻译失败，请重试";
}

function isAbort(error: unknown): boolean {
  return error instanceof TranslationError && error.code === "aborted";
}

interface SessionState {
  options: BilingualSessionOptions;
  engine: TranslationEngine | null;
  target: string;
  detected: string;
  phase: BilingualPhase;
  error: string;
  download: number;
  generation: number;
  running: boolean;
  disposed: boolean;
  abort: AbortController | null;
  /** `target\u0000key` → translation, so a target switch never leaks across. */
  translations: Map<string, string>;
  /** Every block ever requested, so a retry/re-target can replay them. */
  known: Map<string, string>;
  /** Keys of the most recent request (the visible window). */
  lastRequestKeys: string[];
  queue: BilingualSegment[];
  queued: Set<string>;
  listeners: Set<(event: BilingualEvent) => void>;
}

/** Scopes a block key to the current target language. */
function cacheKey(state: SessionState, key: string): string {
  return `${state.target}\u0000${key}`;
}

/** Delivers an event to every subscriber, isolating pane failures. */
function emit(state: SessionState, event: BilingualEvent): void {
  for (const listener of [...state.listeners]) {
    try {
      listener(event);
    } catch {
      // A broken pane must not break translation for the others.
    }
  }
}

/** Counts translated blocks for the current target language. */
function translatedCount(state: SessionState): number {
  let total = 0;
  for (const key of state.translations.keys()) {
    if (key.startsWith(`${state.target}\u0000`)) {
      total += 1;
    }
  }
  return total;
}

/** Builds the public snapshot of session state. */
function snapshot(state: SessionState): BilingualSnapshot {
  return {
    phase: state.phase,
    sourceLanguage: state.detected,
    targetLanguage: state.target,
    error: state.error,
    translated: translatedCount(state),
    pending: state.queued.size,
    downloadProgress: state.download,
  };
}

/** Publishes the current snapshot to subscribers. */
function publish(state: SessionState): void {
  emit(state, { type: "state", snapshot: snapshot(state) });
}

function abortInFlight(state: SessionState): void {
  state.generation += 1;
  state.abort?.abort();
  state.abort = null;
  state.queue.length = 0;
  state.queued.clear();
}

/**
 * Re-runs the most recent `request()` — i.e. the blocks the reader is looking
 * at — rather than every block requested since the page opened. Replaying the
 * whole history sends chapters/pages the user has scrolled past long ago into
 * one serial batch, delaying the visible column.
 */
function replay(state: SessionState): void {
  const keys = state.lastRequestKeys.length
    ? state.lastRequestKeys
    : [...state.known.keys()];
  request(
    state,
    keys.map((key) => ({ key, text: state.known.get(key) ?? "" })),
  );
}

/**
 * Callbacks for one serial batch. `gen` pins them to the session generation:
 * a target-language change or cancel makes every later callback a no-op.
 */
function batchHandlers(state: SessionState, gen: number, keys: string[]) {
  const current = () => gen === state.generation;
  return {
    onLanguages: (languages: {
      sourceLanguage: string;
      targetLanguage: string;
    }) => {
      if (!current()) return;
      state.detected = languages.sourceLanguage;
      state.target = languages.targetLanguage;
      publish(state);
    },
    onProgress: (progress: TranslationProgress) => {
      if (!current()) return;
      state.phase =
        progress.phase !== "cached" ? progress.phase : "translating";
      if (typeof progress.loaded === "number") {
        state.download = progress.loaded;
      }
      publish(state);
    },
    onBlock: (block: TranslationBlockResult, index: number) => {
      if (!current()) return;
      const key = keys[index];
      if (!key) return;
      state.translations.set(cacheKey(state, key), block.translation);
      state.phase = "translating";
      emit(state, { type: "block", key, translation: block.translation });
      publish(state);
    },
  };
}

/** Runs queued batches serially with generation-based cancellation. */
async function pump(state: SessionState): Promise<void> {
  if (state.running || state.disposed) {
    return;
  }
  state.running = true;
  try {
    while (state.queue.length > 0 && !state.disposed) {
      const batch = state.queue.splice(0, state.queue.length);
      batch.forEach((segment) => state.queued.delete(segment.key));
      const gen = state.generation;
      const keys = batch.map((segment) => segment.key);
      const controller = new AbortController();
      state.abort = controller;
      try {
        await translateText({
          blocks: batch.map((segment) => segment.text),
          targetLanguage: state.target,
          // Detection runs once: the pair is reused for every later batch.
          sourceLanguage: state.detected || undefined,
          engine: state.engine as TranslationEngine,
          cache: state.options.cache,
          hasher: state.options.hasher,
          signal: controller.signal,
          ...batchHandlers(state, gen, keys),
        });
        if (gen !== state.generation) {
          continue;
        }
        state.phase = "ready";
        state.error = "";
        state.download = 0;
        publish(state);
      } catch (caught) {
        if (gen !== state.generation || isAbort(caught)) {
          continue;
        }
        state.phase = "error";
        state.error = messageFor(caught) || "翻译失败，请重试";
        publish(state);
      } finally {
        if (state.abort === controller) {
          state.abort = null;
        }
      }
    }
  } finally {
    state.running = false;
    if (state.queue.length > 0 && !state.disposed) {
      void pump(state);
    }
  }
}

/** Queues newly requested blocks and remembers the viewport. */
function request(state: SessionState, segments: BilingualSegment[]): void {
  if (state.disposed) {
    return;
  }
  // Remember every requested block first: a request that arrives while the
  // engine is not resolvable yet must still be replayable by `retry()`.
  const fresh: BilingualSegment[] = [];
  const requested: string[] = [];
  for (const segment of segments) {
    const text = (segment?.text || "").replace(/\s+/g, " ").trim();
    if (!text || !segment.key) {
      continue;
    }
    state.known.set(segment.key, text);
    requested.push(segment.key);
    if (
      state.translations.has(cacheKey(state, segment.key)) ||
      state.queued.has(segment.key)
    ) {
      continue;
    }
    fresh.push({ key: segment.key, text });
  }
  // Remember the window even when everything is already translated: a later
  // target switch must replay exactly this viewport.
  if (requested.length) {
    state.lastRequestKeys = requested;
  }
  if (!fresh.length) {
    return;
  }
  if (state.options.engineProvider) {
    state.engine = state.options.engineProvider();
  }
  if (!state.engine) {
    state.phase = "error";
    state.error = "当前浏览器不支持端上翻译";
    publish(state);
    return;
  }
  for (const segment of fresh) {
    state.queued.add(segment.key);
    state.queue.push(segment);
  }
  state.error = "";
  if (
    state.phase === "idle" ||
    state.phase === "error" ||
    state.phase === "ready"
  ) {
    state.phase = "detecting";
  }
  publish(state);
  void pump(state);
}

/** Cancels in-flight work and resets the session to idle. */
function cancel(state: SessionState): void {
  abortInFlight(state);
  state.phase = "idle";
  state.error = "";
  state.download = 0;
  publish(state);
}

/** Switches target language, resets translations and replays the viewport. */
function setTargetLanguage(state: SessionState, tag: string): void {
  const next = normalizeLanguageTag(tag) || resolveTargetLanguage();
  if (next === state.target) {
    return;
  }
  abortInFlight(state);
  state.target = next;
  state.phase = "detecting";
  state.error = "";
  state.download = 0;
  emit(state, { type: "reset" });
  publish(state);
  replay(state);
  void pump(state);
}

/** Clears detection + translations and replays the viewport. */
function redetect(state: SessionState): void {
  abortInFlight(state);
  state.detected = "";
  const prefix = `${state.target}\u0000`;
  for (const key of [...state.translations.keys()]) {
    if (key.startsWith(prefix)) {
      state.translations.delete(key);
    }
  }
  state.phase = "detecting";
  state.error = "";
  state.download = 0;
  emit(state, { type: "reset" });
  publish(state);
  replay(state);
  void pump(state);
}

/** Replays the viewport after an error. */
function retry(state: SessionState): void {
  if (state.phase !== "error") {
    return;
  }
  state.phase = "detecting";
  state.error = "";
  publish(state);
  replay(state);
  void pump(state);
}

/** Creates an incremental, serial bilingual translation session. */
export function createBilingualSession(
  options: BilingualSessionOptions,
): BilingualSession {
  const state: SessionState = {
    options,
    engine: options.engine,
    target:
      normalizeLanguageTag(options.targetLanguage) || resolveTargetLanguage(),
    detected: "",
    phase: "idle",
    error: "",
    download: 0,
    generation: 0,
    running: false,
    disposed: false,
    abort: null,
    translations: new Map(),
    known: new Map(),
    lastRequestKeys: [],
    queue: [],
    queued: new Set(),
    listeners: new Set(),
  };

  return {
    request: (segments) => request(state, segments),
    cancel: () => cancel(state),
    setTargetLanguage: (tag) => setTargetLanguage(state, tag),
    redetect: () => redetect(state),
    retry: () => retry(state),
    translationFor: (key) => state.translations.get(cacheKey(state, key)),
    snapshot: () => snapshot(state),
    subscribe(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    dispose() {
      state.disposed = true;
      abortInFlight(state);
      state.listeners.clear();
    },
  };
}
