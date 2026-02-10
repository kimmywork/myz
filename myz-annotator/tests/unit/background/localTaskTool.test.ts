import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_TOOL_HANDLERS } from "@/background/ai/tools/local.ts";
import { updatePlanReviewResult } from "@/background/ai/tasks/taskManager.ts";
import type { TextContent } from "@/background/mcp_schema";

type ConversationRecord = { metadata: Record<string, any> };
let conversationStore: ConversationRecord = { metadata: {} };

vi.mock("@/sidepanel/aiStorage", () => {
  return {
    getConversation: vi.fn(async () => conversationStore),
    updateConversationMetadata: vi.fn(async (_id: string, data: any) => {
      conversationStore = {
        ...conversationStore,
        metadata: { ...(conversationStore.metadata || {}), ...(data || {}) },
      };
      return true;
    }),
  };
});

vi.mock("@/background/storage.js", () => ({
  readSettings: vi.fn(async () => ({ aiAssistantEnabled: true, aiMcpServers: [], aiAgents: { conversation: {} } })),
}));

vi.mock("@/background/ai/runtime/agentSelection.js", () => ({
  resolveAgentTarget: vi.fn(() => ({
    provider: { id: "p1" },
    model: { model: "gpt-4", limits: { maxOutputTokens: 100 }, capabilities: { toolCalling: false } },
    temperature: 0.2,
  })),
}));

vi.mock("@/background/ai/runtime/providerSession.js", () => ({
  createProviderSession: vi.fn(() => ({
    listTools: () => [],
    connectMcp: vi.fn(async () => undefined),
    mcp: {
      setConversationContext: vi.fn(),
      setActiveToolFilter: vi.fn(),
    },
    client: {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "done" } }],
      })),
    },
    clientWithTools: {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "done" } }],
      })),
    },
  })),
}));

vi.mock("@/background/ai/skills/storage.js", () => ({
  listSkills: vi.fn(async () => []),
}));

beforeEach(() => {
  conversationStore = { metadata: {} };
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn(),
    },
  };
  vi.clearAllMocks();
});

describe("Task tool", () => {
  it("initializes and lists tasks", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task;

    const initResult = await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        originalUserRequest: "测试任务",
        tasks: [{ title: "任务 A", deliverables: [{ description: "交付 A" }] }],
      },
    });

    expect(initResult.data?.status).toBe("reviewing");
    expect(initResult.data?.tasks?.length).toBe(1);

    const listResult = await taskTool({
      conversationId: "c1",
      payload: { action: "list", onlyUnblocked: false },
    });

    expect(listResult.data?.length).toBe(1);
  });

  it("updates task status and deliverables", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task;

    const initResult = await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        originalUserRequest: "测试任务",
        tasks: [{ title: "任务 A", deliverables: [{ description: "交付 A" }] }],
      },
    });

    const taskId = initResult.data?.tasks?.[0]?.id;

    const updateResult = await taskTool({
      conversationId: "c1",
      payload: { action: "update", taskId, status: "done" },
    });

    const updated = updateResult.data?.tasks?.[0];
    expect(updated?.status).toBe("done");
    expect(updated?.deliverables?.[0]?.status).toBe("done");
  });

  it("infers list action for empty payloads", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task;

    await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        originalUserRequest: "测试任务",
        tasks: [{ title: "任务 A", deliverables: [{ description: "交付 A" }] }],
      },
    });

    const result = await taskTool({ conversationId: "c1" });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data?.length).toBe(1);
    expect((result.content?.[0] as TextContent)?.text).toContain("提示: 调用 Task 时请提供 action 字段");
  });

  it("guards complete_all with role and reason", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task;

    await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        originalUserRequest: "测试任务",
        tasks: [{ title: "任务 A", deliverables: [{ description: "交付 A" }] }],
      },
    });

    await updatePlanReviewResult({
      conversationId: "c1",
      review: { status: "pass", issues: [], missingInfo: [] },
    });

    const resultMissing = await taskTool({
      conversationId: "c1",
      payload: { action: "complete_all" },
    });
    expect(resultMissing.isError).toBe(true);

    const resultWrongRole = await taskTool({
      conversationId: "c1",
      payload: { action: "complete_all", reason: "force", role: "executor" },
    });
    expect(resultWrongRole.isError).toBe(true);

    const resultOk = await taskTool({
      conversationId: "c1",
      payload: { action: "complete_all", reason: "验证结束", role: "validator" },
    });
    expect(resultOk.isError).not.toBe(true);
    expect(resultOk.data?.status).toBe("done");
  });

  it("handles Claude Code Task compatibility payloads", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task;

    const result = await taskTool({
      conversationId: "c1",
      payload: {
        subagent_type: "research",
        description: "检索资料",
        prompt: "总结这段材料的要点",
      },
    });

    expect(result.data?.output).toBe("done");
    expect(result.data?.compat?.subagent_type).toBe("research");
  });
});
