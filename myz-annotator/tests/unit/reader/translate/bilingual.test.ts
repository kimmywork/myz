import { describe, expect, it, vi } from "vitest";
import {
  createBilingualSession,
  type BilingualEvent,
} from "@/reader/translate/bilingual.js";
import { createMemoryTranslationCache } from "@/reader/translate/storage.js";
import type { TranslationEngine } from "@/reader/translate/types.js";

function createEngine(
  overrides: Partial<TranslationEngine> = {},
): TranslationEngine {
  return {
    availability: async () => "available",
    detect: async () => [{ detectedLanguage: "en", confidence: 0.9 }],
    ensureTranslator: async () => {},
    translate: async (_source, target, text) => `[${target}]${text}`,
    destroy: () => {},
    ...overrides,
  };
}

async function waitFor(check: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) {
      throw new Error("timed out waiting for the session");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const ALPHA = { key: "Alpha", text: "Alpha" };
const BETA = { key: "Beta", text: "Beta" };

describe("createBilingualSession", () => {
  it("translates each block once and dedupes repeated requests", async () => {
    const translate = vi.fn(
      async (_source: string, target: string, text: string) =>
        `[${target}]${text}`,
    );
    const session = createBilingualSession({
      engine: createEngine({ translate }),
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA, BETA]);
    await waitFor(() => session.snapshot().phase === "ready");

    expect(session.snapshot().translated).toBe(2);
    expect(session.translationFor("Alpha")).toBe("[zh]Alpha");
    expect(translate).toHaveBeenCalledTimes(2);

    // Scrolling back re-requests the same blocks: nothing runs again.
    session.request([ALPHA, BETA]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("detects the source language once for every later batch", async () => {
    const detect = vi.fn(async () => [
      { detectedLanguage: "en", confidence: 0.9 },
    ]);
    const translate = vi.fn(
      async (_source: string, target: string, text: string) => `[${text}]`,
    );
    const session = createBilingualSession({
      engine: createEngine({ translate, detect }),
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA]);
    await waitFor(() => session.snapshot().phase === "ready");
    session.request([BETA]);
    await waitFor(() => session.translationFor("Beta") === "[Beta]");

    expect(detect).toHaveBeenCalledTimes(1);
    expect(session.snapshot().sourceLanguage).toBe("en");
  });

  it("resets and replays blocks when the target language changes", async () => {
    const events: BilingualEvent[] = [];
    const session = createBilingualSession({
      engine: createEngine(),
      cache: createMemoryTranslationCache(),
    });
    session.subscribe((event) => events.push(event));

    session.request([ALPHA]);
    await waitFor(() => session.translationFor("Alpha") === "[zh]Alpha");

    session.setTargetLanguage("ja");
    await waitFor(() => session.translationFor("Alpha") === "[ja]Alpha");

    expect(events.some((event) => event.type === "reset")).toBe(true);
    expect(session.snapshot().targetLanguage).toBe("ja");
  });

  it("re-detects and retranslates when asked", async () => {
    let detections = 0;
    const detect = vi.fn(async () => [
      {
        detectedLanguage: detections++ === 0 ? "en" : "fr",
        confidence: 0.9,
      },
    ]);
    const translate = vi.fn(
      async (source: string, _target: string, text: string) =>
        `[${source}]${text}`,
    );
    const session = createBilingualSession({
      engine: createEngine({ detect, translate }),
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA]);
    await waitFor(() => Boolean(session.translationFor("Alpha")));
    expect(session.translationFor("Alpha")).toBe("[en]Alpha");

    session.redetect();
    await waitFor(() => session.translationFor("Alpha") === "[fr]Alpha");
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed batch and retries it", async () => {
    let failures = 1;
    const translate = vi.fn(async () => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("boom");
      }
      return "[ok]";
    });
    const session = createBilingualSession({
      engine: createEngine({ translate }),
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA]);
    await waitFor(() => session.snapshot().phase === "error");
    expect(session.snapshot().error).toBe("翻译失败，请重试");

    session.retry();
    await waitFor(() => session.snapshot().phase === "ready");
    expect(session.translationFor("Alpha")).toBe("[ok]");
  });

  it("cancels in-flight work and can start again", async () => {
    const translate = vi.fn(
      async (
        _source: string,
        target: string,
        text: string,
        signal?: AbortSignal,
      ) => {
        if (text === "Alpha") {
          return new Promise<string>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        return `[${target}]${text}`;
      },
    );
    const session = createBilingualSession({
      engine: createEngine({ translate }),
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA]);
    await waitFor(() => translate.mock.calls.length === 1);
    session.cancel();
    expect(session.snapshot().phase).toBe("idle");

    session.request([BETA]);
    await waitFor(() => session.translationFor("Beta") === "[zh]Beta");
    expect(session.snapshot().phase).toBe("ready");
  });

  it("resolves the engine on every request via the provider", async () => {
    // The reader creates the session before anything is translated (a
    // persisted-enabled mode is already on at boot) and tests publish their
    // mock after the page loaded, so the engine must not be captured once.
    let engine: TranslationEngine | null = null;
    const session = createBilingualSession({
      engine: null,
      engineProvider: () => engine,
      cache: createMemoryTranslationCache(),
    });

    session.request([ALPHA]);
    expect(session.snapshot().error).toBe("当前浏览器不支持端上翻译");

    engine = createEngine();
    session.retry();
    await waitFor(() => session.translationFor("Alpha") === "[zh]Alpha");
    expect(session.snapshot().phase).toBe("ready");
  });

  it("reports an unsupported browser", async () => {
    const session = createBilingualSession({ engine: null });
    session.request([ALPHA]);
    expect(session.snapshot().phase).toBe("error");
    expect(session.snapshot().error).toBe("当前浏览器不支持端上翻译");
  });

  it("reports an unsupported language pair", async () => {
    const session = createBilingualSession({
      engine: createEngine({ availability: async () => "unavailable" }),
      cache: createMemoryTranslationCache(),
    });
    session.request([ALPHA]);
    await waitFor(() => session.snapshot().phase === "error");
    expect(session.snapshot().error).toContain("暂不支持");
  });

  it("publishes a block event per finished block", async () => {
    const blocks: string[] = [];
    const session = createBilingualSession({
      engine: createEngine(),
      cache: createMemoryTranslationCache(),
    });
    session.subscribe((event) => {
      if (event.type === "block") {
        blocks.push(`${event.key}:${event.translation}`);
      }
    });

    session.request([ALPHA, BETA]);
    await waitFor(() => blocks.length === 2);
    expect(blocks).toEqual(["Alpha:[zh]Alpha", "Beta:[zh]Beta"]);
  });
});
