import { describe, expect, it, vi } from "vitest";
import { createReasoningNormalizationCapability } from "@/background/ai/providers/capabilities/reasoning.ts";
import { createToolCallingCapability } from "@/background/ai/providers/capabilities/toolCalling.ts";
import { createQwenThinkingCapability } from "@/background/ai/providers/capabilities/qwenThinking.ts";
import { createGoogleGeminiThinkingCapability } from "@/background/ai/providers/capabilities/googleGemini.ts";
import { createSseStreamingCapability } from "@/background/ai/providers/capabilities/sseStreaming.ts";
import {
  installFetchMock,
  mockFetchOnce,
  createToolCallSequenceClient,
} from "./testUtils.ts";

describe("provider capabilities", () => {
  it("normalizes reasoning content", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "ok" },
                { type: "reasoning", text: "why" },
              ],
            },
          },
        ],
      })),
    } as any;

    const wrapped = createReasoningNormalizationCapability()(client);
    const response = await wrapped.createCompletion({} as any, {} as any);
    const message = (response as any).choices?.[0]?.message as any;
    expect(message?.content).toBe("ok");
    expect(message?.reasoning_content).toBe("why");
  });

  it("patches qwen thinking config", async () => {
    const client = { createCompletion: vi.fn(async () => ({ choices: [] })) } as any;
    const wrapped = createQwenThinkingCapability()(client);
    await wrapped.createCompletion({ model: "qwen", messages: [] } as any, {
      enableGeminiThinking: true,
    } as any);
    expect(client.createCompletion).toHaveBeenCalled();
    const request = client.createCompletion.mock.calls[0][0];
    expect(request.extra_body.enable_thinking).toBe(true);
  });

  it("patches gemini thinking config", async () => {
    const client = { createCompletion: vi.fn(async () => ({ choices: [] })) } as any;
    const wrapped = createGoogleGeminiThinkingCapability()(client);
    await wrapped.createCompletion({ model: "gemini-1.5", messages: [] } as any, {
      enableGeminiThinking: true,
    } as any);
    const request = client.createCompletion.mock.calls[0][0];
    expect(request.extra_body.google.thinking_config.include_thoughts).toBe(true);
  });

  it("executes tool calls and appends tool results", async () => {
    const callOrder: any[] = [];
    const client = createToolCallSequenceClient({
      steps: [
        {
          tool_calls: [{ id: "c1", function: { name: "ToolA", arguments: "{\"x\":1}" } }],
        },
        { content: "done" },
      ],
      onRequest: (request) => {
        callOrder.push(request);
      },
    }) as any;

    const capability = createToolCallingCapability({
      getTools: async () => [{ type: "function", function: { name: "ToolA" } }],
      executeToolCall: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const wrapped = capability(client);
    const response = await wrapped.createCompletion({ model: "gpt-4", messages: [] } as any, {
      onToolResultMessage: vi.fn(),
    } as any);
    expect((response as any).choices?.[0]?.message?.content).toBe("done");
    const followUp = callOrder[1];
    expect(followUp.messages.some((msg: any) => msg.role === "tool")).toBe(true);
  });

  it("handles SelectTools dynamic selection", async () => {
    const client = createToolCallSequenceClient({
      steps: [
        {
          tool_calls: [
            { id: "c1", function: { name: "SelectTools", arguments: "{\"need\":\"search\"}" } },
          ],
        },
        { content: "done" },
      ],
    }) as any;

    const setActiveToolFilter = vi.fn();
    const capability = createToolCallingCapability({
      getTools: async () => [{ type: "function", function: { name: "SelectTools" } }],
      executeToolCall: async () => ({}),
    });

    const wrapped = capability(client);
    await wrapped.createCompletion({ model: "gpt-4", messages: [] } as any, {
      dynamicToolSelection: {
        enabled: true,
        candidates: [{ name: "ToolA" }],
        selectToolNames: async () => ["ToolA"],
        setActiveToolFilter,
      },
      onToolResultMessage: vi.fn(),
    } as any);
    expect(setActiveToolFilter).toHaveBeenCalled();
  });

  it("supports multi-round tool calls with extra content", async () => {
    const requests: any[] = [];
    const client = createToolCallSequenceClient({
      steps: [
        {
          role: "assistant",
          content: "Visible <thought>hidden</thought>",
          extra_content: { google: { thought: true } },
          tool_calls: [{ id: "c1", function: { name: "ToolA", arguments: "{}" } }],
        },
        {
          tool_calls: [{ id: "c2", function: { name: "ToolB", arguments: "{\"q\":1}" } }],
        },
        { content: "all done" },
      ],
      onRequest: (request) => {
        requests.push(request);
      },
    }) as any;

    const executeToolCall = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const capability = createToolCallingCapability({
      getTools: async () => [
        { type: "function", function: { name: "ToolA" } },
        { type: "function", function: { name: "ToolB" } },
      ],
      executeToolCall,
    });

    const wrapped = capability(client);
    const response = await wrapped.createCompletion({ model: "gpt-4", messages: [] } as any, {
      onToolResultMessage: vi.fn(),
    } as any);

    expect((response as any).choices?.[0]?.message?.content).toBe("all done");
    expect(executeToolCall).toHaveBeenCalledTimes(2);
    expect(requests).toHaveLength(3);
    const secondRequest = requests[1];
    const assistantMessage = secondRequest.messages.find((msg: any) => msg.role === "assistant");
    expect(assistantMessage?.content).toBe("Visible");
  });

  it("parses SSE streaming responses", async () => {
    const fetchMock = installFetchMock();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n" +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    mockFetchOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream as any,
    });

    const client = { createCompletion: vi.fn(async () => ({ choices: [] })) } as any;
    const wrapped = createSseStreamingCapability({
      endpoint: "http://localhost",
      buildHeaders: {},
    })(client);

    const response = await wrapped.createCompletion({
      model: "gpt-4",
      messages: [],
      stream: true,
    } as any, { onStreamDelta: vi.fn() } as any);

    expect((response as any).choices?.[0]?.message?.content).toBe("hi");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("parses SSE streaming tool calls with extra content", async () => {
    installFetchMock();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"function\":{\"name\":\"ToolA\",\"arguments\":\"{\\\"x\\\":\"}}]}}]}\n\n" +
              "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"1}\"},\"extra_content\":{\"google\":{\"thought_signature\":\"sig\"}}}]}}]}\n\n" +
              "data: {\"choices\":[{\"delta\":{\"content\":\"done\"}}]}\n\n" +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    mockFetchOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream as any,
    });

    const client = { createCompletion: vi.fn(async () => ({ choices: [] })) } as any;
    const wrapped = createSseStreamingCapability({
      endpoint: "http://localhost",
      buildHeaders: {},
    })(client);

    const response = await wrapped.createCompletion({
      model: "gpt-4",
      messages: [],
      stream: true,
    } as any, { onStreamDelta: vi.fn() } as any);

    const message = (response as any).choices?.[0]?.message;
    expect(message?.content).toBe("done");
    expect(message?.tool_calls?.[0]?.function?.name).toBe("ToolA");
    expect(message?.tool_calls?.[0]?.function?.arguments).toBe("{\"x\":1}");
    expect(message?.tool_calls?.[0]?.extra_content?.google?.thought_signature).toBe("sig");
  });

  it("parses gemini SSE thought tags and tool calls", async () => {
    installFetchMock();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello <thought>Thinking</thought> world\"}}]}\n\n" +
              "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"function\":{\"name\":\"ToolA\",\"arguments\":\"{}\"},\"extra_content\":{\"google\":{\"thought_signature\":\"sig\"}}}]}}]}\n\n" +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    mockFetchOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream as any,
    });

    const client = { createCompletion: vi.fn(async () => ({ choices: [] })) } as any;
    const wrapped = createSseStreamingCapability({
      endpoint: "http://localhost",
      buildHeaders: {},
    })(client);

    const response = await wrapped.createCompletion({
      model: "gemini-1.5",
      messages: [],
      stream: true,
    } as any, { onStreamDelta: vi.fn() } as any);

    const message = (response as any).choices?.[0]?.message;
    expect(message?.content).toBe("Hello  world");
    expect(message?.reasoning_content).toBe("Thinking");
    expect(message?.tool_calls?.[0]?.function?.name).toBe("ToolA");
    expect(message?.tool_calls?.[0]?.extra_content?.google?.thought_signature).toBe("sig");
  });
});
