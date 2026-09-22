import { describe, expect, it, vi } from "vitest";
import {
  TranslationError,
  translateText,
  type TranslationProgress,
} from "@/reader/translate/service.js";
import { createMemoryTranslationCache } from "@/reader/translate/storage.js";
import type { TranslationEngine } from "@/reader/translate/types.js";

function createEngine(
  overrides: Partial<TranslationEngine> = {},
): TranslationEngine {
  return {
    availability: async () => "available",
    detect: async () => [{ detectedLanguage: "en", confidence: 0.9 }],
    ensureTranslator: async (_source, _target, options) => {
      options?.onProgress?.(0.5);
    },
    translate: async (_source, _target, text) => `[${text}]`,
    destroy: () => {},
    ...overrides,
  };
}

describe("translateText", () => {
  it("detects, translates and caches each chunk", async () => {
    const cache = createMemoryTranslationCache();
    const translate = vi.fn(
      async (_s: string, _t: string, text: string) => `[${text}]`,
    );
    const engine = createEngine({ translate });

    const outcome = await translateText({
      text: "Hello there.",
      targetLanguage: "zh",
      engine,
      cache,
      hasher: async (text) => `h-${text}`,
    });

    expect(outcome.sourceLanguage).toBe("en");
    expect(outcome.targetLanguage).toBe("zh");
    expect(outcome.translation).toBe("[Hello there.]");
    expect(outcome.cached).toBe(false);
    expect(translate).toHaveBeenCalledOnce();
    expect(await cache.get("en:zh:h-Hello there.")).toBe("[Hello there.]");
  });

  it("serves a cached chunk without calling the engine", async () => {
    const cache = createMemoryTranslationCache();
    await cache.set("en:zh:h-Hello there.", "你好。");
    const translate = vi.fn(async () => "SHOULD NOT RUN");
    const ensureTranslator = vi.fn(async () => {});
    const engine = createEngine({ translate, ensureTranslator });

    const outcome = await translateText({
      text: "Hello there.",
      targetLanguage: "zh",
      engine,
      cache,
      hasher: async () => "h-Hello there.",
    });

    expect(outcome.cached).toBe(true);
    expect(outcome.translation).toBe("你好。");
    expect(translate).not.toHaveBeenCalled();
    expect(ensureTranslator).not.toHaveBeenCalled();
  });

  it("rejects when the source already matches the target", async () => {
    await expect(
      translateText({
        text: "你好世界。",
        targetLanguage: "zh",
        engine: createEngine({
          detect: async () => [{ detectedLanguage: "zh", confidence: 0.9 }],
        }),
      }),
    ).rejects.toMatchObject({ code: "same-language" });
  });

  it("rejects unsupported language pairs", async () => {
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine({ availability: async () => "unavailable" }),
      }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("rejects when detection yields nothing", async () => {
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine({ detect: async () => [] }),
      }),
    ).rejects.toMatchObject({ code: "detect-failed" });
  });

  it("surfaces quota errors distinctly", async () => {
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine({
          translate: async () => {
            throw new Error("Quota exceeded");
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "quota" });
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "aborted" });
  });

  it("chunks long text, reports progress and joins the result", async () => {
    const translate = vi.fn(
      async (_s: string, _t: string, text: string) => `[${text}]`,
    );
    const engine = createEngine({
      translate,
      detect: async () => [{ detectedLanguage: "de", confidence: 0.9 }],
    });
    const progress: TranslationProgress[] = [];

    const outcome = await translateText({
      text: "First sentence. Second sentence. Third sentence.",
      targetLanguage: "en",
      engine,
      hasher: async (text) => `h-${text}`,
      maxChunkLength: 18,
      onProgress: (value) => progress.push(value),
    });

    expect(translate.mock.calls.length).toBeGreaterThan(1);
    expect(outcome.translation).toContain("[First sentence.");
    expect(progress.some((item) => item.phase === "detecting")).toBe(true);
    expect(progress.some((item) => item.phase === "downloading")).toBe(true);
    expect(progress.some((item) => typeof item.partial === "string")).toBe(
      true,
    );
    expect(progress.at(-1)?.completedChunks).toBe(outcome.chunks.length);
  });

  it("maps user-activation failures to a retry message", async () => {
    const error = new Error("requires user activation");
    error.name = "NotAllowedError";
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine({
          translate: async () => {
            throw error;
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "activation" });
  });

  it("maps detector activation failures to a retry message", async () => {
    const error = new Error("requires user activation");
    error.name = "NotAllowedError";
    await expect(
      translateText({
        text: "Hello",
        targetLanguage: "zh",
        engine: createEngine({
          detect: async () => {
            throw error;
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "activation" });
  });

  it("keeps paragraph structure across blocks", async () => {
    const translate = vi.fn(
      async (_s: string, _t: string, text: string) => `[${text}]`,
    );
    const outcome = await translateText({
      text: "First paragraph.\n\nSecond paragraph.",
      targetLanguage: "zh",
      engine: createEngine({ translate }),
      hasher: async (text) => `h-${text}`,
    });

    expect(outcome.blocks).toHaveLength(2);
    expect(outcome.blocks[0].translation).toBe("[First paragraph.]");
    expect(outcome.blocks[1].translation).toBe("[Second paragraph.]");
    expect(outcome.translation).toBe(
      "[First paragraph.]\n\n[Second paragraph.]",
    );
  });

  it("translates document-captured blocks one by one", async () => {
    const translate = vi.fn(
      async (_s: string, _t: string, text: string) => `[${text}]`,
    );
    const outcome = await translateText({
      blocks: ["Heading", "Body one.", "Body two."],
      targetLanguage: "zh",
      engine: createEngine({ translate }),
      hasher: async (text) => `h-${text}`,
    });

    expect(translate).toHaveBeenCalledTimes(3);
    expect(outcome.blocks).toHaveLength(3);
    expect(outcome.translation).toBe("[Heading]\n\n[Body one.]\n\n[Body two.]");
  });

  it("is a TranslationError subclass with a message", async () => {
    const error = await translateText({
      text: "",
      targetLanguage: "zh",
      engine: createEngine(),
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(TranslationError);
  });
});
