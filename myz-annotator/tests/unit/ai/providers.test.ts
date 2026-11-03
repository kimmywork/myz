import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_PROMPT_TEMPLATE,
  normalizePromptTemplate,
  renderAiPrompt,
} from "../../../src/ai/prompt";
import {
  getAiProvider,
  isAiProviderId,
  isProviderLoginUrl,
  isProviderNewChatUrl,
  providerForUrl,
} from "../../../src/ai/providers";
import {
  DEFAULT_AI_SETTINGS,
  normalizeAiSettings,
} from "../../../src/ai/settings";

/**
 * The background decides "reuse the tab / open a new chat / leave a login page
 * alone" from provider URLs only (the chat apps are SPAs with hashed class
 * names), and renders the prompt from a user template. Both are pinned here
 * rather than re-discovered through the DOM or a live browser.
 */
describe("AI provider registry", () => {
  it("maps chat URLs to their provider", () => {
    expect(providerForUrl("https://chat.deepseek.com/")?.id).toBe("deepseek");
    expect(providerForUrl("https://chat.qwen.ai/c/123")?.id).toBe("qwen");
    expect(providerForUrl("https://chat.deepseek.com.evil.test/")).toBeNull();
    expect(providerForUrl("https://example.com/")).toBeNull();
    expect(providerForUrl(undefined)).toBeNull();
  });

  it("ignores object prototype keys", () => {
    expect(isAiProviderId("deepseek")).toBe(true);
    expect(isAiProviderId("constructor")).toBe(false);
    expect(isAiProviderId("__proto__")).toBe(false);
    expect(isAiProviderId("toString")).toBe(false);
  });

  it("falls back to the default provider for unknown ids", () => {
    expect(getAiProvider("qwen").id).toBe("qwen");
    expect(getAiProvider("nope").id).toBe("deepseek");
    expect(getAiProvider(undefined).id).toBe("deepseek");
  });

  it("treats both providers as usable", () => {
    expect(getAiProvider("deepseek").available).toBe(true);
    expect(getAiProvider("qwen").available).toBe(true);
  });

  it("detects sign-in and root paths per provider", () => {
    const deepseek = getAiProvider("deepseek");
    const qwen = getAiProvider("qwen");
    expect(
      isProviderLoginUrl(deepseek, "https://chat.deepseek.com/sign_in"),
    ).toBe(true);
    expect(
      isProviderLoginUrl(deepseek, "https://chat.deepseek.com/login?x=1"),
    ).toBe(true);
    expect(isProviderLoginUrl(deepseek, "https://chat.deepseek.com/")).toBe(
      false,
    );
    expect(isProviderLoginUrl(deepseek, "not a url")).toBe(false);
    // Qwen signs in under /auth and keeps chats under /c/:id.
    expect(
      isProviderLoginUrl(qwen, "https://chat.qwen.ai/auth?action=signin"),
    ).toBe(true);
    expect(isProviderLoginUrl(qwen, "https://chat.qwen.ai/c/abc")).toBe(false);
    expect(isProviderLoginUrl(qwen, "https://chat.qwen.ai/authorize")).toBe(
      false,
    );
    expect(isProviderNewChatUrl(qwen, "https://chat.qwen.ai/")).toBe(true);
    expect(isProviderNewChatUrl(qwen, "https://chat.qwen.ai/c/abc")).toBe(
      false,
    );
    // Draft routes count as "fresh conversation" too: the sidebar button may
    // land on one of them instead of the root.
    expect(isProviderNewChatUrl(qwen, "https://chat.qwen.ai/c/new-chat")).toBe(
      true,
    );
    expect(isProviderNewChatUrl(qwen, "https://chat.qwen.ai/c/local")).toBe(
      true,
    );

    expect(isProviderNewChatUrl(deepseek, "https://chat.deepseek.com")).toBe(
      true,
    );
    expect(isProviderNewChatUrl(deepseek, "https://chat.deepseek.com/")).toBe(
      true,
    );
    expect(
      isProviderNewChatUrl(deepseek, "https://chat.deepseek.com/?ref=x"),
    ).toBe(true);
    expect(
      isProviderNewChatUrl(deepseek, "https://chat.deepseek.com/a/chat/s/abc"),
    ).toBe(false);
  });
});

describe("prompt template", () => {
  it("renders the default template with the excerpt and URL", () => {
    expect(
      renderAiPrompt({
        template: DEFAULT_AI_PROMPT_TEMPLATE,
        text: "第一段\n\n第二段",
        url: "https://example.com/a",
      }),
    ).toBe(
      "帮我解读这段文字：\n\n第一段\n\n第二段\n\n网页URL： https://example.com/a",
    );
  });

  it("is case-insensitive and accepts spaces inside the placeholders", () => {
    expect(
      renderAiPrompt({
        template: "summarize { text } from {url}",
        text: "hello",
        url: "https://example.com",
      }),
    ).toBe("summarize hello from https://example.com");
  });

  it("appends the parts a custom template forgot", () => {
    expect(
      renderAiPrompt({
        template: "解释一下",
        text: "abc",
        url: "https://x.test",
      }),
    ).toBe("解释一下\n\nabc\n\nhttps://x.test");
    expect(
      renderAiPrompt({
        template: "解释 {TEXT}",
        text: "abc",
        url: "https://x",
      }),
    ).toBe("解释 abc\n\nhttps://x");
  });

  it("does not re-substitute placeholders that arrive with the excerpt", () => {
    expect(
      renderAiPrompt({
        template: "snippet: {TEXT}",
        text: "use {url} inside the template",
        url: "https://example.com",
      }),
    ).toBe("snippet: use {url} inside the template\n\nhttps://example.com");
  });

  it("uses an image placeholder for image-only selections", () => {
    expect(
      renderAiPrompt({
        template: DEFAULT_AI_PROMPT_TEMPLATE,
        text: "   ",
        url: "https://x.test",
      }),
    ).toContain("（见随附图片）");
  });

  it("keeps a template unchanged when it has no placeholders at all", () => {
    expect(normalizePromptTemplate("  ")).toBe(DEFAULT_AI_PROMPT_TEMPLATE);
    expect(normalizePromptTemplate("hi {TEXT}")).toBe("hi {TEXT}");
    expect(normalizePromptTemplate(undefined)).toBe(DEFAULT_AI_PROMPT_TEMPLATE);
  });
});

describe("AI settings normalization", () => {
  it("fills defaults for missing or invalid values", () => {
    expect(normalizeAiSettings(undefined)).toEqual(DEFAULT_AI_SETTINGS);
    expect(normalizeAiSettings({ enabled: false })).toEqual({
      ...DEFAULT_AI_SETTINGS,
      enabled: false,
    });
    expect(normalizeAiSettings({ provider: "nope" }).provider).toBe("deepseek");
    expect(normalizeAiSettings({ provider: "qwen" }).provider).toBe("qwen");
    expect(normalizeAiSettings({ promptTemplate: "  " }).promptTemplate).toBe(
      DEFAULT_AI_PROMPT_TEMPLATE,
    );
  });
});
