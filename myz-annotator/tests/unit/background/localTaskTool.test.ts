import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_TOOL_HANDLERS } from "@/background/ai/tools/local.ts";

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
});
