import { describe, expect, it } from "vitest";
import { installFetchMock, mockFetchOnce } from "./testUtils.ts";
import {
  AnthropicJsonClient,
  extractAnthropicModels,
  buildAnthropicHeaders,
} from "@/background/ai/providers/anthropic/jsonClient.ts";
import {
  GeminiJsonClient,
  extractGeminiModels,
  buildGeminiHeaders,
} from "@/background/ai/providers/gemini/jsonClient.ts";
import {
  OllamaJsonClient,
  extractOllamaModels,
  buildOllamaHeaders,
} from "@/background/ai/providers/ollama/jsonClient.ts";
import {
  OpenAICompatibleJsonClient,
  shouldUseDeveloperRole,
} from "@/background/ai/providers/openaiCompatible/jsonClient.ts";
import { OpenAIResponsesJsonClient } from "@/background/ai/providers/openaiResponses/jsonClient.ts";

describe("provider clients", () => {
  it("OpenAI compatible client posts to endpoint", async () => {
    const fetchMock = installFetchMock();
    mockFetchOnce({
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const client = new OpenAICompatibleJsonClient({
      endpoint: "http://localhost/chat",
      buildHeaders: { Authorization: "Bearer token" },
    });

    const response = await client.createCompletion({
      model: "gpt-4",
      messages: [],
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("OpenAI responses client parses output", async () => {
    installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hello" }],
          },
        ],
      }),
    });

    const client = new OpenAIResponsesJsonClient({
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "gpt-4",
      messages: [],
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("hello");
  });

  it("OpenAI responses client parses tool calls and reasoning", async () => {
    installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hi" }],
          },
          {
            type: "function_call",
            call_id: "call-1",
            name: "ToolA",
            arguments: '{"x":1}',
          },
          {
            type: "reasoning",
            summary: "because",
          },
        ],
      }),
    });

    const client = new OpenAIResponsesJsonClient({
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "gpt-4",
      messages: [],
    } as any);
    const message = (response as any).choices?.[0]?.message;
    expect(message?.content).toBe("hi");
    expect(message?.tool_calls?.[0]?.function?.name).toBe("ToolA");
    expect(message?.reasoning_content).toBe("because");
  });

  it("OpenAI responses client omits temperature for GPT-5 models", async () => {
    const fetchMock = installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hello" }],
          },
        ],
      }),
    });

    const client = new OpenAIResponsesJsonClient({
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });

    await client.createCompletion({
      model: "gpt-5",
      temperature: 0.7,
      messages: [],
    } as any);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(requestBody.temperature).toBeUndefined();
  });

  it("OpenAI responses client drops tool history from older turns", async () => {
    const fetchMock = installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
          },
        ],
      }),
    });

    const client = new OpenAIResponsesJsonClient({
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });

    await client.createCompletion({
      model: "gpt-4",
      messages: [
        { role: "user", content: "clone repo" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-old",
              type: "function",
              function: {
                name: "Run",
                arguments: '{"command":"git clone repo"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-old",
          content: "Cloning into 'repo'...",
        },
        { role: "assistant", content: "repo cloned" },
        { role: "user", content: "delete it" },
      ],
    } as any);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(requestBody.input).not.toContainEqual(
      expect.objectContaining({
        type: "function_call",
        call_id: "call-old",
      }),
    );
    expect(requestBody.input).not.toContainEqual(
      expect.objectContaining({
        type: "function_call_output",
        call_id: "call-old",
      }),
    );
    expect(requestBody.input).toContainEqual(
      expect.objectContaining({
        type: "message",
        role: "assistant",
      }),
    );
    expect(requestBody.input).toContainEqual(
      expect.objectContaining({
        type: "message",
        role: "user",
      }),
    );
  });

  it("OpenAI responses client keeps tool calls for the active turn", async () => {
    const fetchMock = installFetchMock();
    mockFetchOnce({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
        ],
      }),
    });

    const client = new OpenAIResponsesJsonClient({
      baseUrl: "http://localhost/v1",
      apiKey: "key",
      headers: "",
    });

    await client.createCompletion({
      model: "gpt-4",
      messages: [
        { role: "user", content: "delete repo" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-active",
              type: "function",
              function: {
                name: "Run",
                arguments: '{"command":"rm -rf repo"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-active",
          content: "removed",
        },
      ],
    } as any);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(requestBody.input).toContainEqual(
      expect.objectContaining({
        type: "function_call",
        call_id: "call-active",
      }),
    );
    expect(requestBody.input).toContainEqual(
      expect.objectContaining({
        type: "function_call_output",
        call_id: "call-active",
        output: "removed",
      }),
    );
  });

  it("Gemini client extracts message", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "gemini" }] } }],
      }),
    });

    const client = new GeminiJsonClient({
      baseUrl: "http://localhost/models",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "gemini-1.5",
      messages: [],
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("gemini");
  });

  it("Gemini client extracts tool calls with thought signature", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: "ok" },
                {
                  functionCall: { id: "c1", name: "ToolA", args: { q: 1 } },
                  thoughtSignature: "sig",
                },
              ],
            },
          },
        ],
      }),
    });

    const client = new GeminiJsonClient({
      baseUrl: "http://localhost/models",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "gemini-1.5",
      messages: [],
    } as any);
    const message = (response as any).choices?.[0]?.message;
    expect(message?.tool_calls?.[0]?.function?.name).toBe("ToolA");
    expect(
      message?.tool_calls?.[0]?.extra_content?.google?.thoughtSignature,
    ).toBe("sig");
  });

  it("Anthropic client extracts message", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({
        content: [{ type: "text", text: "anthropic" }],
      }),
    });

    const client = new AnthropicJsonClient({
      baseUrl: "http://localhost",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "claude-3",
      messages: [],
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("anthropic");
  });

  it("Anthropic client extracts tool calls", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({
        content: [
          { type: "text", text: "ok" },
          { type: "tool_use", id: "t1", name: "ToolA", input: { x: 1 } },
        ],
      }),
    });

    const client = new AnthropicJsonClient({
      baseUrl: "http://localhost",
      apiKey: "key",
      headers: "",
    });

    const response = await client.createCompletion({
      model: "claude-3",
      messages: [],
    } as any);
    const message = (response as any).choices?.[0]?.message;
    expect(message?.tool_calls?.[0]?.function?.name).toBe("ToolA");
  });

  it("Ollama client extracts response", async () => {
    installFetchMock();
    mockFetchOnce({
      json: async () => ({ response: "ollama" }),
    });

    const client = new OllamaJsonClient({
      baseUrl: "http://localhost",
      headers: "",
    });
    const response = await client.createCompletion({
      model: "llama3",
      messages: [],
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("ollama");
  });

  it("extracts model lists and headers", () => {
    expect(extractGeminiModels({ models: [{ name: "models/a" }] })).toEqual([
      "a",
    ]);
    expect(extractAnthropicModels({ data: [{ id: "claude" }] })).toEqual([
      "claude",
    ]);
    expect(extractOllamaModels({ models: [{ name: "llama" }] })).toEqual([
      "llama",
    ]);
    expect(buildGeminiHeaders("key", "")["x-goog-api-key"]).toBe("key");
    expect(buildAnthropicHeaders("key", "")["x-api-key"]).toBe("key");
    expect(buildOllamaHeaders("")["Content-Type"]).toBe("application/json");
  });

  it("detects developer role support", () => {
    expect(shouldUseDeveloperRole("gpt-4")).toBe(true);
    expect(shouldUseDeveloperRole("gpt-3.5")).toBe(false);
  });
});
