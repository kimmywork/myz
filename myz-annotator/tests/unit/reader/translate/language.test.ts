import { describe, expect, it } from "vitest";
import {
  baseLanguage,
  isSameLanguage,
  languageLabel,
  normalizeLanguageTag,
  resolveTargetLanguage,
} from "@/reader/translate/language.js";

describe("normalizeLanguageTag", () => {
  it("collapses simplified Chinese variants to zh", () => {
    expect(normalizeLanguageTag("zh")).toBe("zh");
    expect(normalizeLanguageTag("zh-CN")).toBe("zh");
    expect(normalizeLanguageTag("zh-Hans")).toBe("zh");
    expect(normalizeLanguageTag("zh-SG")).toBe("zh");
  });

  it("collapses traditional Chinese variants to zh-Hant", () => {
    expect(normalizeLanguageTag("zh-TW")).toBe("zh-Hant");
    expect(normalizeLanguageTag("zh-HK")).toBe("zh-Hant");
    expect(normalizeLanguageTag("zh-Hant")).toBe("zh-Hant");
  });

  it("lowercases other tags and handles empty input", () => {
    expect(normalizeLanguageTag("EN-US")).toBe("en-us");
    expect(normalizeLanguageTag("")).toBe("");
    expect(normalizeLanguageTag(undefined)).toBe("");
  });
});

describe("resolveTargetLanguage", () => {
  it("maps a Simplified Chinese UI to zh", () => {
    expect(resolveTargetLanguage("zh-CN")).toBe("zh");
    expect(resolveTargetLanguage("zh")).toBe("zh");
  });

  it("maps a Traditional Chinese UI to zh-Hant", () => {
    expect(resolveTargetLanguage("zh-TW")).toBe("zh-Hant");
    expect(resolveTargetLanguage("zh-HK")).toBe("zh-Hant");
  });

  it("falls back to zh for non-Chinese UI languages", () => {
    expect(resolveTargetLanguage("en-US")).toBe("zh");
    expect(resolveTargetLanguage("ja")).toBe("zh");
    expect(resolveTargetLanguage(undefined)).toBe("zh");
  });
});

describe("isSameLanguage", () => {
  it("treats region variants of the same script as equal", () => {
    expect(isSameLanguage("zh-CN", "zh")).toBe(true);
    expect(isSameLanguage("zh-TW", "zh-Hant")).toBe(true);
    expect(isSameLanguage("EN", "en-US")).toBe(true);
  });

  it("keeps simplified and traditional Chinese distinct", () => {
    expect(isSameLanguage("zh", "zh-Hant")).toBe(false);
  });

  it("is false when either side is unknown", () => {
    expect(isSameLanguage("", "zh")).toBe(false);
  });
});

describe("baseLanguage / languageLabel", () => {
  it("strips the region subtag", () => {
    expect(baseLanguage("en-US")).toBe("en");
    expect(baseLanguage("zh-TW")).toBe("zh");
  });

  it("labels known languages", () => {
    expect(languageLabel("zh")).toBe("中文");
    expect(languageLabel("zh-Hant")).toBe("繁体中文");
    expect(languageLabel("")).toBe("未知语言");
  });
});
