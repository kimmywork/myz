import { describe, expect, it } from "vitest";
import { installFetchMock, mockFetchOnce } from "./testUtils.ts";
import * as registry from "@/background/ai/providers/registry.ts";

describe("provider registry", () => {
  it("fetches models from openai-compatible", async () => {
    installFetchMock();
    mockFetchOnce({ json: async () => ({ data: [{ id: "gpt-4" }] }) });
    const models = await registry.fetchProviderModels({
      type: "openai_compatible",
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });
    expect(models).toEqual(["gpt-4"]);
  });

  it("throws when fetch models fails", async () => {
    installFetchMock();
    mockFetchOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "bad",
    });
    await expect(
      registry.fetchProviderModels({
        type: "gemini",
        baseUrl: "http://localhost",
        apiKey: "key",
        headers: "",
      }),
    ).rejects.toThrow(/Fetch models failed/);
  });

  it("tests provider connection", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({
        choices: [{ message: { content: "Connection successful" } }],
      }),
    });

    const result = await registry.testProviderConnection({
      provider: {
        baseUrl: "http://localhost",
        apiKey: "key",
        headers: "",
        type: "openai_compatible",
      },
      model: "gpt-4",
    });
    expect(result.success).toBe(true);
  });
});
