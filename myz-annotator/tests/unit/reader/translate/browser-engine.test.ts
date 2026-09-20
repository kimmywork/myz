import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserTranslationEngine } from "@/reader/translate/browser-engine.js";

interface FakeGlobals {
  Translator?: unknown;
  LanguageDetector?: unknown;
}

const globals = globalThis as unknown as FakeGlobals;

afterEach(() => {
  delete globals.Translator;
  delete globals.LanguageDetector;
});

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function installTranslator() {
  const createOptions: { signal?: AbortSignal }[] = [];
  const translate = vi.fn(
    async (text: string, options?: { signal?: AbortSignal }) => {
      if (options?.signal?.aborted) {
        throw abortError();
      }
      return `T:${text}`;
    },
  );
  globals.Translator = {
    availability: async () => "available",
    create: async (options: { signal?: AbortSignal }) => {
      createOptions.push(options);
      return { translate, destroy: vi.fn() };
    },
  };
  return { createOptions, translate };
}

describe("browser-engine translator lifetime", () => {
  it("creates the translator without a run signal", async () => {
    const { createOptions } = installTranslator();
    const engine = createBrowserTranslationEngine();
    expect(engine).not.toBeNull();

    const controller = new AbortController();
    await engine!.ensureTranslator("en", "zh");
    // Aborting the popover's signal must not destroy the cached translator.
    controller.abort();

    expect(createOptions[0]?.signal).toBeUndefined();
    await expect(engine!.translate("en", "zh", "hello")).resolves.toBe(
      "T:hello",
    );
  });

  it("reuses one translator per language pair", async () => {
    const { translate } = installTranslator();
    const engine = createBrowserTranslationEngine()!;

    await engine.translate("en", "zh", "a");
    await engine.translate("en", "zh", "b");
    await engine.translate("en", "zh-Hant", "c");

    expect(translate).toHaveBeenCalledTimes(3);
  });
});

describe("browser-engine detector lifetime", () => {
  it("uses a fresh detector per call so aborts cannot block later runs", async () => {
    let created = 0;
    const detect = vi.fn(
      async (_text: string, options?: { signal?: AbortSignal }) => {
        if (options?.signal?.aborted) {
          throw abortError();
        }
        return [{ detectedLanguage: "en", confidence: 0.9 }];
      },
    );
    globals.Translator = {
      availability: async () => "available",
      create: async () => ({ translate: async () => "", destroy: vi.fn() }),
    };
    globals.LanguageDetector = {
      availability: async () => "available",
      create: async () => {
        created += 1;
        return { detect, destroy: vi.fn() };
      },
    };
    const engine = createBrowserTranslationEngine()!;

    const aborted = new AbortController();
    aborted.abort();
    await expect(engine.detect("hello", aborted.signal)).resolves.toEqual([]);

    const result = await engine.detect("hello");
    expect(result[0]?.detectedLanguage).toBe("en");
    expect(created).toBe(2);
  });
});
