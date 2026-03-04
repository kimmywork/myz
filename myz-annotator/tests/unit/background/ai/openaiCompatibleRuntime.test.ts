import { describe, expect, it } from "vitest";
import {
  buildChatCompletionsUrl,
  buildModelsUrl,
  buildProviderHeaders,
  extractOpenAICompatibleModels,
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
});
