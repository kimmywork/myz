import { describe, expect, it, vi } from "vitest";
import {
  installFakeChrome,
  createToolCallSequenceClient,
} from "./testUtils.ts";
import { createToolCallingCapability } from "@/background/ai/providers/capabilities/toolCalling.ts";

let conversationMetadata: any = null;
const savedMessages: any[] = [];
let superpowerEnabled = false;

vi.mock("@/sidepanel/aiStorage.js", () => ({
  saveMessage: vi.fn(async (message: any) => {
    savedMessages.push(message);
  }),
  getConversation: vi.fn(async () => ({
    id: "c1",
    metadata: conversationMetadata,
  })),
  getMessagesForConversation: vi.fn(async () => []),
}));

vi.mock("@/background/ai.js", () => ({
  readAiConversations: vi.fn(async () => ({ conversations: {} })),
}));

vi.mock("@/background/storage.js", () => ({
  readSettings: vi.fn(async () => ({
    aiAgents: { conversation: { superpowerMode: superpowerEnabled } },
  })),
}));

const { ConversationAgent } = await import(
  "@/background/ai/agents/conversationAgent.ts"
);

describe("ConversationAgent", () => {
  it("rejects attachments when model lacks vision", async () => {
    installFakeChrome();
    const agent = new ConversationAgent();
    await expect(
      agent.processConversation(
        "c1",
        "chat",
        "hello",
        {
          attachments: [
            { type: "image", dataUrl: "data:image/png;base64,abc" },
          ],
        },
        {
          isEnabled: true,
          client: { createCompletion: vi.fn() } as any,
          callConfig: {
            provider: { id: "p1", name: "p" } as any,
            model: {
              model: "gpt-4",
              capabilities: { vision: false },
              limits: {
                maxOutputTokens: 128,
                maxOutputTokenParam: "max_tokens",
              },
            } as any,
            temperature: 0.2,
            compressImages: false,
          },
        },
      ),
    ).rejects.toThrow("Vision");
  });

  it("applies tool selection filters", async () => {
    installFakeChrome();
    const agent = new ConversationAgent();

    const setActiveToolFilter = vi.fn();
    const listTools = vi.fn(() => [
      { name: "SelectTools" },
      { name: "ToolA" },
      { name: "RequiredTool" },
    ]);

    await agent.processConversation(
      "c1",
      "chat",
      "hello",
      { requiredToolNames: ["RequiredTool"] },
      {
        isEnabled: true,
        client: {
          createCompletion: vi.fn(async () => ({
            choices: [{ message: { content: "ok" } }],
          })),
        } as any,
        callConfig: {
          provider: { id: "p1", name: "p" } as any,
          model: {
            model: "gpt-4",
            capabilities: { vision: true },
            limits: { maxOutputTokens: 128, maxOutputTokenParam: "max_tokens" },
          } as any,
          temperature: 0.2,
          compressImages: false,
        },
        toolControl: { listTools, setActiveToolFilter },
        toolSelector: {
          enabled: true,
          selectToolNames: vi.fn(async () => ["ToolA"]),
        },
      },
    );

    const lastCall = setActiveToolFilter.mock.calls.find((call) =>
      Array.isArray(call[0]),
    );
    expect(lastCall?.[0]).toEqual(["SelectTools", "ToolA", "RequiredTool"]);
  });

  it("appends task directive when executing", async () => {
    installFakeChrome();
    superpowerEnabled = true;
    conversationMetadata = {
      taskPlan: {
        status: "executing",
        goal: "do stuff",
        tasks: [
          {
            id: "t1",
            title: "Task one",
            status: "pending",
            owner: "executor",
            category: "quick",
            skills: ["browser-ops"],
            summary: "deliver",
            notes: [],
            blockedBy: [],
          },
        ],
      },
    };

    const requests: any[] = [];
    const client = {
      createCompletion: vi.fn(async (request: any) => {
        requests.push(request);
        return { choices: [{ message: { content: "ok" } }] };
      }),
    } as any;

    const agent = new ConversationAgent();
    await agent.processConversation(
      "c1",
      "chat",
      "hello",
      {},
      {
        isEnabled: true,
        client,
        callConfig: {
          provider: { id: "p1", name: "p" } as any,
          model: {
            model: "gpt-4",
            capabilities: { vision: true },
            limits: { maxOutputTokens: 128, maxOutputTokenParam: "max_tokens" },
          } as any,
          temperature: 0.2,
          compressImages: false,
        },
      },
    );

    const lastUserMessage = requests[0].messages.findLast(
      (msg: any) => msg.role === "user",
    );
    const content = Array.isArray(lastUserMessage.content)
      ? lastUserMessage.content.map((part: any) => part.text || "").join("")
      : String(lastUserMessage.content || "");
    expect(content).toContain("当前任务：Task one");
    superpowerEnabled = false;
  });

  it("persists multi-round tool call messages and results", async () => {
    installFakeChrome();
    savedMessages.length = 0;
    superpowerEnabled = false;
    conversationMetadata = null;

    const baseClient = createToolCallSequenceClient({
      steps: [
        {
          content: "Visible <thought>hidden</thought>",
          extra_content: { google: { thought: true } },
          tool_calls: [
            { id: "c1", function: { name: "ToolA", arguments: '{"x":1}' } },
          ],
        },
        {
          tool_calls: [
            { id: "c2", function: { name: "ToolB", arguments: '{"y":2}' } },
          ],
        },
        { content: "final answer" },
      ],
    }) as any;

    const client = createToolCallingCapability({
      getTools: async () => [
        {
          type: "function",
          function: {
            name: "ToolA",
            description: "Tool A",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "ToolB",
            description: "Tool B",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      executeToolCall: async (toolCall: any) => ({
        content: [{ type: "text", text: `result:${toolCall?.function?.name}` }],
      }),
    })(baseClient as any);

    const agent = new ConversationAgent();
    await agent.processConversation(
      "c1",
      "chat",
      "hello",
      {},
      {
        isEnabled: true,
        client,
        callConfig: {
          provider: { id: "p1", name: "p" } as any,
          model: {
            model: "gpt-4",
            capabilities: { vision: true },
            limits: { maxOutputTokens: 128, maxOutputTokenParam: "max_tokens" },
          } as any,
          temperature: 0.2,
          compressImages: false,
        },
      },
    );

    const toolCallMessages = savedMessages.filter(
      (msg) =>
        msg.role === "assistant" &&
        Array.isArray(msg.tool_calls) &&
        msg.tool_calls.length,
    );
    const toolMessages = savedMessages.filter((msg) => msg.role === "tool");
    const assistantMessages = savedMessages.filter(
      (msg) => msg.role === "assistant" && !msg.tool_calls?.length,
    );

    expect(toolCallMessages).toHaveLength(2);
    expect(toolMessages).toHaveLength(2);
    expect(
      assistantMessages.some((msg) => msg.content === "final answer"),
    ).toBe(true);

    const toolA = toolCallMessages.find(
      (msg) => msg.tool_calls?.[0]?.function?.name === "ToolA",
    );
    expect(toolA?.content).toBe("Visible");
    expect(toolA?.reasoning_content).toBe("hidden");

    const toolResultTexts = toolMessages.map((msg) => msg.content);
    expect(toolResultTexts).toEqual(
      expect.arrayContaining(["result:ToolA", "result:ToolB"]),
    );
  });

  it("injects system prompt as user message when configured", async () => {
    installFakeChrome();
    savedMessages.length = 0;
    superpowerEnabled = false;
    conversationMetadata = null;

    const requests: any[] = [];
    const client = {
      createCompletion: vi.fn(async (request: any) => {
        requests.push(request);
        return { choices: [{ message: { content: "ok" } }] };
      }),
    } as any;

    const agent = new ConversationAgent();
    await agent.processConversation(
      "c1",
      "chat",
      "hello",
      {},
      {
        isEnabled: true,
        client,
        callConfig: {
          provider: { id: "p1", name: "p" } as any,
          model: {
            model: "gpt-4",
            capabilities: { vision: true },
            limits: { maxOutputTokens: 128, maxOutputTokenParam: "max_tokens" },
            systemPromptInUserMessage: true,
          } as any,
          temperature: 0.2,
          compressImages: false,
        },
      },
    );

    const payload = requests[0];
    const roles = payload.messages.map((msg: any) => msg.role);
    expect(roles).not.toContain("system");
    expect(roles[0]).toBe("user");
    const firstContent = Array.isArray(payload.messages[0].content)
      ? payload.messages[0].content.map((part: any) => part.text || "").join("")
      : String(payload.messages[0].content || "");
    expect(firstContent).toContain("你是浏览器智能助理");
    expect(firstContent).toContain("当前日期:");
    expect(firstContent).not.toContain("当前时间:");
  });

  it("normalizes streamed usage metadata for persisted messages and stream completion events", async () => {
    const chromeMock = installFakeChrome();
    savedMessages.length = 0;
    superpowerEnabled = false;
    conversationMetadata = null;

    const agent = new ConversationAgent();
    await agent.processConversation(
      "c1",
      "chat",
      "hello",
      {
        stream: true,
        streamId: "stream-usage-1",
      },
      {
        isEnabled: true,
        client: {
          createCompletion: vi.fn(async () => ({
            choices: [{ message: { content: "streamed reply" } }],
            usage: {
              promptTokenCount: 120,
              candidatesTokenCount: 45,
              totalTokenCount: 165,
              thoughtsTokenCount: 12,
              cachedContentTokenCount: 30,
            },
          })),
        } as any,
        callConfig: {
          provider: { id: "p1", name: "p" } as any,
          model: {
            model: "gemini-2.5-flash",
            capabilities: { vision: true, reasoning: true },
            limits: {
              maxOutputTokens: 128,
              maxOutputTokenParam: "max_tokens",
              contextWindow: 2048,
            },
          } as any,
          temperature: 0.2,
          compressImages: false,
        },
      },
    );

    const persisted = savedMessages.find(
      (msg) => msg.role === "assistant" && msg.content === "streamed reply",
    );
    expect(persisted?.metadata?.usage).toMatchObject({
      total_tokens: 165,
      prompt_tokens: 120,
      completion_tokens: 45,
      reasoning_tokens: 12,
      cached_prompt_tokens: 30,
    });

    const completeEvent = (chromeMock.runtime.sendMessage as any).mock.calls
      .map((call: any[]) => call[0])
      .find((payload: any) => payload?.type === "myz:aiStreamComplete");
    expect(completeEvent?.data?.metadata?.usage).toMatchObject({
      total_tokens: 165,
      prompt_tokens: 120,
      completion_tokens: 45,
      reasoning_tokens: 12,
      cached_prompt_tokens: 30,
    });
  });
});
