import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachDeliverableArtifact,
  getTaskPlan,
  initTaskPlan,
  listUnblockedTasks,
  startTaskPlanExecution,
  updatePlanReviewResult,
} from "@/background/ai/tasks/taskManager.ts";
import { isRecord } from "@/shared/typeUtils";

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

describe("taskManager v2", () => {
  it("initializes plan with review status and blocked tasks", async () => {
    const plan = await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          deliverables: [{ description: "Deliver A" }],
        },
        {
          id: "t-2",
          title: "Task B",
          blockedBy: ["t-1"],
          deliverables: [{ description: "Deliver B" }],
        },
      ],
    });

    expect(plan.status).toBe("reviewing");
    expect(plan.planReview.status).toBe("pending");
    expect(plan.mode).toBe("orchestrated");
    const blocked = plan.tasks.find((task) => task.id === "t-2");
    expect(blocked?.status).toBe("blocked");
  });

  it("starts execution and picks next unblocked task", async () => {
    await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          deliverables: [{ description: "Deliver A" }],
        },
        {
          id: "t-2",
          title: "Task B",
          blockedBy: ["t-1"],
          deliverables: [{ description: "Deliver B" }],
        },
      ],
    });

    const plan = await startTaskPlanExecution("c1");
    expect(plan?.status).toBe("executing");
    expect(plan?.currentTaskId).toBe("t-1");
    const taskA = plan?.tasks.find((task) => task.id === "t-1");
    const taskB = plan?.tasks.find((task) => task.id === "t-2");
    expect(taskA?.status).toBe("in_progress");
    expect(taskB?.status).toBe("blocked");
  });

  it("updates plan review to needs_revision", async () => {
    await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        { title: "Task A", deliverables: [{ description: "Deliver A" }] },
      ],
    });

    await updatePlanReviewResult({
      conversationId: "c1",
      review: {
        status: "needs_revision",
        issues: ["缺少验收标准"],
        missingInfo: [],
      },
    });

    const plan = await getTaskPlan("c1");
    expect(plan?.status).toBe("needs_revision");
    expect(plan?.planReview.status).toBe("needs_revision");
  });

  it("lists only unblocked tasks when requested", async () => {
    await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          deliverables: [{ description: "Deliver A" }],
        },
        {
          id: "t-2",
          title: "Task B",
          blockedBy: ["t-1"],
          deliverables: [{ description: "Deliver B" }],
        },
      ],
    });
    await startTaskPlanExecution("c1");
    const list = await listUnblockedTasks({
      conversationId: "c1",
      status: ["pending", "in_progress"],
    });
    const ids = list.map((task) => task.id);
    expect(ids).toContain("t-1");
    expect(ids).not.toContain("t-2");
  });

  it("breaks cyclic dependencies to avoid deadlock", async () => {
    const plan = await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          blockedBy: ["t-2"],
          deliverables: [{ description: "Deliver A" }],
        },
        {
          id: "t-2",
          title: "Task B",
          blockedBy: ["t-1"],
          deliverables: [{ description: "Deliver B" }],
        },
      ],
    });

    const unblocked = plan.tasks.filter((task) => task.status !== "blocked");
    expect(unblocked.length).toBeGreaterThan(0);
  });

  it("truncates oversized artifacts", async () => {
    await initTaskPlan({
      conversationId: "c1",
      originalUserRequest: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          deliverables: [{ description: "Deliver A" }],
        },
      ],
    });

    const bigText = "x".repeat(40000);
    const updated = await attachDeliverableArtifact({
      conversationId: "c1",
      taskId: "t-1",
      deliverableIndex: 0,
      artifact: { type: "note", payload: bigText },
    });

    const payload =
      updated?.tasks?.[0]?.deliverables?.[0]?.artifacts?.[0]?.payload;
    expect(typeof payload).toBe("string");
    if (typeof payload === "string") {
      expect(payload.length).toBeLessThanOrEqual(32000);
    }

    const updatedObj = await attachDeliverableArtifact({
      conversationId: "c1",
      taskId: "t-1",
      deliverableIndex: 0,
      artifact: { type: "json", payload: { text: bigText } },
    });

    const payloadObj =
      updatedObj?.tasks?.[0]?.deliverables?.[0]?.artifacts?.[1]?.payload;
    const payloadRecord = isRecord(payloadObj) ? payloadObj : {};
    expect(payloadRecord.truncated).toBe(true);
    expect(String(payloadRecord.content || "").length).toBeLessThanOrEqual(
      32000,
    );
  });
});
