/**
 * Translation orchestration: detect → resolve target → chunk → cache → translate.
 *
 * Pure logic over the injected engine, cache and hasher, so it can be unit
 * tested without a browser or a real model.
 */

import {
  buildCacheKey,
  type TextHasher,
  type TranslationCache,
} from "./cache.js";
import {
  DEFAULT_CHUNK_LENGTH,
  splitIntoBlocks,
  splitIntoChunks,
} from "./chunk.js";
import {
  isSameLanguage,
  languageLabel,
  normalizeLanguageTag,
  resolveTargetLanguage,
} from "./language.js";
import type { TranslationEngine } from "./types.js";

export type TranslationErrorCode =
  | "engine-unavailable"
  | "detect-failed"
  | "same-language"
  | "unsupported"
  | "quota"
  | "activation"
  | "aborted"
  | "failed";

export class TranslationError extends Error {
  readonly code: TranslationErrorCode;

  constructor(code: TranslationErrorCode, message: string) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
  }
}

export type TranslationPhase =
  "detecting" | "downloading" | "translating" | "cached";

export interface TranslationProgress {
  phase: TranslationPhase;
  /** Download progress in the 0..1 range, when known. */
  loaded?: number;
  completedChunks: number;
  totalChunks: number;
  /** Translation assembled from the chunks finished so far. */
  partial?: string;
}

export interface TranslationChunkResult {
  source: string;
  translation: string;
  cached: boolean;
}

export interface TranslationBlockResult {
  source: string;
  translation: string;
}

export interface TranslationOutcome {
  sourceLanguage: string;
  targetLanguage: string;
  translation: string;
  /** One entry per source paragraph, in order. */
  blocks: TranslationBlockResult[];
  chunks: TranslationChunkResult[];
  /** True when every chunk was served from the cache. */
  cached: boolean;
}

export interface TranslateRequest {
  text: string;
  targetLanguage?: string;
  engine: TranslationEngine;
  cache?: TranslationCache | null;
  hasher?: TextHasher;
  signal?: AbortSignal;
  /** Override the chunk size (tests); production uses the default. */
  maxChunkLength?: number;
  onProgress?: (progress: TranslationProgress) => void;
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TranslationError("aborted", "翻译已取消");
  }
}

/** Chinese/Japanese/Korean output joins without spaces; Latin scripts need one. */
function joinTranslations(targetLanguage: string, parts: string[]): string {
  const base = targetLanguage.toLowerCase();
  const separator = /^(zh|ja|ko)/.test(base) ? "" : " ";
  return parts.join(separator);
}

/**
 * Detects the source language. Detection is best-effort: an unsupported
 * detector or an empty result surfaces as `detect-failed` so the UI can offer
 * a retry. Low-confidence guesses are still used, but the popover shows the
 * detected language so the user can retry when the direction looks wrong.
 */
async function detectSourceLanguage(
  request: TranslateRequest,
  text: string,
): Promise<string> {
  let results: { detectedLanguage: string; confidence: number }[] = [];
  try {
    results = await request.engine.detect(text, request.signal);
  } catch (error) {
    if (isAbort(error) || request.signal?.aborted) {
      throw new TranslationError("aborted", "翻译已取消");
    }
    if ((error as { name?: string })?.name === "NotAllowedError") {
      throw new TranslationError(
        "activation",
        "需要点按才会开始翻译，请再点一次",
      );
    }
    throw new TranslationError("detect-failed", "未能识别原文语言，请重试");
  }
  const best = results?.[0];
  const detected = normalizeLanguageTag(best?.detectedLanguage);
  if (!detected) {
    throw new TranslationError("detect-failed", "未能识别原文语言，请重试");
  }
  return detected;
}

export async function translateText(
  request: TranslateRequest,
): Promise<TranslationOutcome> {
  const text = request.text.trim();
  if (!text) {
    throw new TranslationError("failed", "没有可翻译的文字");
  }
  const signal = request.signal;
  throwIfAborted(signal);

  request.onProgress?.({
    phase: "detecting",
    completedChunks: 0,
    totalChunks: 0,
  });

  const sourceLanguage = await detectSourceLanguage(request, text);
  const targetLanguage =
    normalizeLanguageTag(request.targetLanguage) || resolveTargetLanguage();

  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    throw new TranslationError(
      "same-language",
      `原文已经是${languageLabel(targetLanguage)}`,
    );
  }

  let availability: Awaited<ReturnType<TranslationEngine["availability"]>>;
  try {
    availability = await request.engine.availability(
      sourceLanguage,
      targetLanguage,
    );
  } catch {
    availability = "unavailable";
  }
  if (availability === "unavailable") {
    throw new TranslationError(
      "unsupported",
      `暂不支持 ${languageLabel(sourceLanguage)} → ${languageLabel(targetLanguage)}`,
    );
  }

  const blocks = splitIntoBlocks(text);
  if (!blocks.length) {
    throw new TranslationError("failed", "没有可翻译的文字");
  }
  const blockChunks = blocks.map((block) =>
    splitIntoChunks(block, request.maxChunkLength ?? DEFAULT_CHUNK_LENGTH),
  );
  const totalChunks = blockChunks.reduce(
    (total, chunks) => total + chunks.length,
    0,
  );

  const results: TranslationChunkResult[] = [];
  const blockParts: string[][] = blocks.map(() => []);
  const assemble = () =>
    blockParts
      .map((parts) =>
        parts.length ? joinTranslations(targetLanguage, parts) : "",
      )
      .filter(Boolean)
      .join("\n\n");

  const emit = (progress: Partial<TranslationProgress>) => {
    request.onProgress?.({
      phase: "translating",
      completedChunks: results.length,
      totalChunks,
      partial: assemble(),
      ...progress,
    });
  };

  for (let blockIndex = 0; blockIndex < blockChunks.length; blockIndex += 1) {
    for (const chunk of blockChunks[blockIndex]) {
      throwIfAborted(signal);
      const key = await buildCacheKey(
        sourceLanguage,
        targetLanguage,
        chunk,
        request.hasher,
      );
      const cached = request.cache ? await request.cache.get(key) : undefined;
      if (typeof cached === "string" && cached) {
        results.push({ source: chunk, translation: cached, cached: true });
        blockParts[blockIndex].push(cached);
        emit({
          phase: "cached",
          completedChunks: results.length,
          totalChunks,
        });
        continue;
      }

      try {
        await request.engine.ensureTranslator(sourceLanguage, targetLanguage, {
          onProgress: (loaded) =>
            emit({
              phase: "downloading",
              loaded,
              completedChunks: results.length,
              totalChunks,
            }),
        });
        const translation = await request.engine.translate(
          sourceLanguage,
          targetLanguage,
          chunk,
          signal,
        );
        results.push({ source: chunk, translation, cached: false });
        blockParts[blockIndex].push(translation);
        await request.cache?.set(key, translation);
        emit({ completedChunks: results.length, totalChunks });
      } catch (error) {
        if (isAbort(error) || signal?.aborted) {
          throw new TranslationError("aborted", "翻译已取消");
        }
        const message = (error as Error)?.message || "";
        const name = (error as { name?: string })?.name || "";
        if (
          /notallowed|user activation|activation/i.test(`${name} ${message}`)
        ) {
          throw new TranslationError(
            "activation",
            "需要点按才会开始翻译，请再点一次",
          );
        }
        if (/quota|too long|maximum/i.test(message)) {
          throw new TranslationError("quota", "这段文字太长，请分段翻译");
        }
        throw new TranslationError("failed", "翻译失败，请重试");
      }
    }
  }

  return {
    sourceLanguage,
    targetLanguage,
    translation: assemble(),
    blocks: blocks.map((source, index) => ({
      source,
      translation: joinTranslations(targetLanguage, blockParts[index]),
    })),
    chunks: results,
    cached: results.length > 0 && results.every((item) => item.cached),
  };
}
