import { describe, expect, it } from "vitest";
import {
  buildChatCompletionsUrl,
  buildModelsUrl,
  buildProviderHeaders,
  extractOpenAICompatibleModels,
  resolveOpenAICompatibleProfile,
  shouldReplayOpenAICompatibleReasoning,
} from "@/background/ai/runtime/openaiCompatible.ts";

describe("openaiCompatible runtime", () => {
  it("builds urls", () => {
    expect(buildModelsUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1/models",
    );
    expect(buildChatCompletionsUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("builds headers with api key", () => {
    const headers = buildProviderHeaders("token", "");
    expect(headers.Authorization).toContain("token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("extracts model list", () => {
    expect(
      extractOpenAICompatibleModels({ data: [{ id: "a" }, { id: "" }] }),
    ).toEqual(["a"]);
  });

  it("enables reasoning replay only for third-party openai-compatible providers", () => {
    expect(
      shouldReplayOpenAICompatibleReasoning({
        type: "openai_compatible",
        baseUrl: "https://api.example.com/v1",
      }),
    ).toBe(true);
    expect(
      shouldReplayOpenAICompatibleReasoning({
        type: "openai_compatible",
        baseUrl: "https://api.openai.com/v1",
      }),
    ).toBe(false);
    expect(
      shouldReplayOpenAICompatibleReasoning({
        type: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
      }),
    ).toBe(false);
    expect(
      shouldReplayOpenAICompatibleReasoning({
        type: "openai_compatible",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        compatProfile: "qwen",
      }),
    ).toBe(false);
  });

  it("resolves openai-compatible profiles from base url or explicit config", () => {
    expect(
      resolveOpenAICompatibleProfile({
        type: "openai_compatible",
        baseUrl: "https://api.deepseek.com/v1",
        compatProfile: "auto",
      }),
    ).toBe("deepseek");
    expect(
      resolveOpenAICompatibleProfile({
        type: "openai_compatible",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        compatProfile: "auto",
      }),
    ).toBe("glm");
    expect(
      resolveOpenAICompatibleProfile({
        type: "openai_compatible",
        baseUrl: "https://api.anything.invalid/v1",
        compatProfile: "moonshot",
      }),
    ).toBe("moonshot");
  });
});
