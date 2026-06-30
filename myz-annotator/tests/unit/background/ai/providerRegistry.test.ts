import { describe, expect, it } from "vitest";
import { installFetchMock, mockFetchOnce } from "./testUtils.ts";
import * as registry from "@/background/ai/providers/registry.ts";

describe("provider registry", () => {
  it("fetches models from openai-compatible", async () => {
    installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [{ id: "gpt-4" }] }),
    });
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

  it("fetches models from mistral", async () => {
    installFetchMock();
    const payload = {
      object: "list",
      data: [
        {
          id: "mistral-small-latest",
          object: "model",
          created: 1700000000,
          owned_by: "mistral",
          max_context_length: 131072,
          capabilities: {
            completion_chat: true,
            function_calling: true,
            reasoning: true,
            completion_fim: false,
            fine_tuning: false,
            vision: true,
            ocr: false,
            classification: false,
            moderation: false,
            audio: false,
            audio_transcription: false,
            audio_transcription_realtime: false,
            audio_speech: false,
          },
          type: "base",
        },
      ],
    };
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    });
    const models = await registry.fetchProviderModels({
      type: "mistral",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: "key",
      headers: "",
    });
    expect(models).toEqual(["mistral-small-latest"]);
  });

  it("tests provider connection", async () => {
    const fetchMock = installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"Connection successful"}}]}\n\n' +
                "data: [DONE]\n\n",
            ),
          );
          controller.close();
        },
      }) as any,
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
        streamingEnabled: true,
      },
      model: "gpt-4",
    });
    expect(result.success).toBe(true);

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body || "{}"),
    );
    expect(requestBody.stream).toBe(true);
  });

  it("tests mistral provider connection", async () => {
    installFetchMock();
    const payload = {
      id: "chatcmpl-1",
      object: "chat.completion",
      model: "mistral-small-latest",
      created: 1700000000,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Connection successful",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    };
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    });

    const result = await registry.testProviderConnection({
      provider: {
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: "key",
        headers: "",
        type: "mistral",
        streamingEnabled: false,
      },
      model: "mistral-small-latest",
    });
    expect(result.success).toBe(true);
    expect(result.response).toContain("Connection successful");
  });
});
