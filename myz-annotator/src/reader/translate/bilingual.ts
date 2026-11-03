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
import { TranslationError, translateText } from "./service.js";
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

export function createBilingualSession(
  options: BilingualSessionOptions,
): BilingualSession {
  let engine = options.engine;
  let target =
    normalizeLanguageTag(options.targetLanguage) || resolveTargetLanguage();
  let detected = "";
  let phase: BilingualPhase = "idle";
  let error = "";
  let download = 0;
  let generation = 0;
  let running = false;
  let disposed = false;
  let abort: AbortController | null = null;

  /** `target\u0000key` → translation, so a target switch never leaks across. */
  const translations = new Map<string, string>();
  /** Every block ever requested, so a retry/re-target can replay them. */
  const known = new Map<string, string>();
  const queue: BilingualSegment[] = [];
  const queued = new Set<string>();
  const listeners = new Set<(event: BilingualEvent) => void>();

  function cacheKey(key: string): string {
    return `${target}\u0000${key}`;
  }

  function emit(event: BilingualEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A broken pane must not break translation for the others.
      }
    }
  }

  function translatedCount(): number {
    let total = 0;
    for (const key of translations.keys()) {
      if (key.startsWith(`${target}\u0000`)) {
        total += 1;
      }
    }
    return total;
  }

  function snapshot(): BilingualSnapshot {
    return {
      phase,
      sourceLanguage: detected,
      targetLanguage: target,
      error,
      translated: translatedCount(),
      pending: queued.size,
      downloadProgress: download,
    };
  }

  function publish(): void {
    emit({ type: "state", snapshot: snapshot() });
  }

  function abortInFlight(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    queue.length = 0;
    queued.clear();
  }

  function replay(): void {
    request(
      [...known.entries()].map(([key, text]) => ({
        key,
        text,
      })),
    );
  }

  async function pump(): Promise<void> {
    if (running || disposed) {
      return;
    }
    running = true;
    try {
      while (queue.length > 0 && !disposed) {
        const batch = queue.splice(0, queue.length);
        batch.forEach((segment) => queued.delete(segment.key));
        const gen = generation;
        const keys = batch.map((segment) => segment.key);
        const controller = new AbortController();
        abort = controller;
        try {
          await translateText({
            blocks: batch.map((segment) => segment.text),
            targetLanguage: target,
            // Detection runs once: the pair is reused for every later batch.
            sourceLanguage: detected || undefined,
            engine: engine as TranslationEngine,
            cache: options.cache,
            hasher: options.hasher,
            signal: controller.signal,
            onLanguages: (languages) => {
              if (gen !== generation) {
                return;
              }
              detected = languages.sourceLanguage;
              target = languages.targetLanguage;
              publish();
            },
            onProgress: (progress) => {
              if (gen !== generation) {
                return;
              }
              if (progress.phase !== "cached") {
                phase = progress.phase;
              } else {
                phase = "translating";
              }
              if (typeof progress.loaded === "number") {
                download = progress.loaded;
              }
              publish();
            },
            onBlock: (block, index) => {
              if (gen !== generation) {
                return;
              }
              const key = keys[index];
              if (!key) {
                return;
              }
              translations.set(cacheKey(key), block.translation);
              phase = "translating";
              emit({ type: "block", key, translation: block.translation });
              publish();
            },
          });
          if (gen !== generation) {
            continue;
          }
          phase = "ready";
          error = "";
          download = 0;
          publish();
        } catch (caught) {
          if (gen !== generation || isAbort(caught)) {
            continue;
          }
          phase = "error";
          error = messageFor(caught) || "翻译失败，请重试";
          publish();
        } finally {
          if (abort === controller) {
            abort = null;
          }
        }
      }
    } finally {
      running = false;
      if (queue.length > 0 && !disposed) {
        void pump();
      }
    }
  }

  function request(segments: BilingualSegment[]): void {
    if (disposed) {
      return;
    }
    // Remember every requested block first: a request that arrives while the
    // engine is not resolvable yet must still be replayable by `retry()`.
    const fresh: BilingualSegment[] = [];
    for (const segment of segments) {
      const text = (segment?.text || "").replace(/\s+/g, " ").trim();
      if (!text || !segment.key) {
        continue;
      }
      known.set(segment.key, text);
      if (translations.has(cacheKey(segment.key)) || queued.has(segment.key)) {
        continue;
      }
      fresh.push({ key: segment.key, text });
    }
    if (!fresh.length) {
      return;
    }
    if (options.engineProvider) {
      engine = options.engineProvider();
    }
    if (!engine) {
      phase = "error";
      error = "当前浏览器不支持端上翻译";
      publish();
      return;
    }
    for (const segment of fresh) {
      queued.add(segment.key);
      queue.push(segment);
    }
    error = "";
    if (phase === "idle" || phase === "error" || phase === "ready") {
      phase = "detecting";
    }
    publish();
    void pump();
  }

  function cancel(): void {
    abortInFlight();
    phase = "idle";
    error = "";
    download = 0;
    publish();
  }

  function setTargetLanguage(tag: string): void {
    const next = normalizeLanguageTag(tag) || resolveTargetLanguage();
    if (next === target) {
      return;
    }
    abortInFlight();
    target = next;
    phase = "detecting";
    error = "";
    download = 0;
    emit({ type: "reset" });
    publish();
    replay();
    void pump();
  }

  function redetect(): void {
    abortInFlight();
    detected = "";
    const prefix = `${target}\u0000`;
    for (const key of [...translations.keys()]) {
      if (key.startsWith(prefix)) {
        translations.delete(key);
      }
    }
    phase = "detecting";
    error = "";
    download = 0;
    emit({ type: "reset" });
    publish();
    replay();
    void pump();
  }

  function retry(): void {
    if (phase !== "error") {
      return;
    }
    phase = "detecting";
    error = "";
    publish();
    replay();
    void pump();
  }

  return {
    request,
    cancel,
    setTargetLanguage,
    redetect,
    retry,
    translationFor(key) {
      return translations.get(cacheKey(key));
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      abortInFlight();
      listeners.clear();
    },
  };
}
