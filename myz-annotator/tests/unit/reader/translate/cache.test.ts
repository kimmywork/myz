import { describe, expect, it } from "vitest";
import { buildCacheKey } from "@/reader/translate/cache.js";

describe("buildCacheKey", () => {
  it("joins source, target and hash with lowercased languages", async () => {
    const key = await buildCacheKey(
      "EN",
      "zh-Hant",
      "hello",
      async () => "abc",
    );
    expect(key).toBe("en:zh-hant:abc");
  });

  it("differs by language pair for the same text", async () => {
    const hasher = async () => "same";
    const first = await buildCacheKey("en", "zh", "hello", hasher);
    const second = await buildCacheKey("en", "zh-Hant", "hello", hasher);
    expect(first).not.toBe(second);
  });
});
