import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeAllTasks,
  getTaskPlan,
  initTaskPlan,
  listUnblockedTasks,
  normalizeTaskPlanPayload,
  startTaskPlanExecution,
  updateTaskItem,
} from "@/background/ai/tasks/taskManager.ts";

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

describe("taskManager v3", () => {
  it("initializes a lightweight plan and blocks dependent tasks", async () => {
    const plan = await initTaskPlan({
      conversationId: "c1",
      goal: "do something",
      tasks: [
        {
          id: "t-1",
          title: "Task A",
          summary: "Inspect the current page",
        },
        {
          id: "t-2",
          title: "Task B",
          blockedBy: ["t-1"],
        },
      ],
    });

    expect(plan.status).toBe("planning");
    expect(plan.goal).toBe("do something");
    const blocked = plan.tasks.find((task) => task.id === "t-2");
    expect(blocked?.status).toBe("blocked");
  });

  it("starts execution and picks the next runnable task", async () => {
    await initTaskPlan({
      conversationId: "c1",
      goal: "do something",
      tasks: [
        { id: "t-1", title: "Task A" },
        { id: "t-2", title: "Task B", blockedBy: ["t-1"] },
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

  it("updates task summary, notes and outcome", async () => {
    await initTaskPlan({
      conversationId: "c1",
      goal: "do something",
      tasks: [{ id: "t-1", title: "Task A" }],
    });

    const updated = await updateTaskItem({
      conversationId: "c1",
      taskId: "t-1",
      patch: {
        status: "done",
        summary: "Completed the page inspection",
        notes: ["Captured the key fields"],
        outcome: "Ready for the next step",
      },
    });

    const task = updated?.tasks.find((item) => item.id === "t-1");
    expect(task?.status).toBe("done");
    expect(task?.summary).toContain("Completed");
    expect(task?.notes).toContain("Captured the key fields");
    expect(task?.outcome).toContain("Ready");
  });

  it("lists only unblocked tasks when requested", async () => {
    await initTaskPlan({
      conversationId: "c1",
      goal: "do something",
      tasks: [
        { id: "t-1", title: "Task A" },
        { id: "t-2", title: "Task B", blockedBy: ["t-1"] },
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

  it("normalizes legacy deliverables into summary and notes", () => {
    const plan = normalizeTaskPlanPayload({
      id: "legacy-plan",
      status: "executing",
      originalUserRequest: "legacy goal",
      tasks: [
        {
          id: "legacy-task",
          title: "Legacy Task",
          deliverables: [
            {
              description: "Primary deliverable",
              artifacts: [{ type: "note", payload: "Observed value A" }],
            },
            {
              description: "Secondary deliverable",
            },
          ],
        },
      ],
    });

    expect(plan?.goal).toBe("legacy goal");
    expect(plan?.tasks[0]?.summary).toBe("Primary deliverable");
    expect(plan?.tasks[0]?.notes).toContain("Secondary deliverable");
    expect(
      plan?.tasks[0]?.notes.some((item) => item.includes("Observed value A")),
    ).toBe(true);
  });

  it("completes the whole plan with plan-level outcome", async () => {
    await initTaskPlan({
      conversationId: "c1",
      goal: "finish the workflow",
      tasks: [{ id: "t-1", title: "Task A" }],
    });

    const completed = await completeAllTasks({
      conversationId: "c1",
      summary: "All planned steps were executed",
      outcome: "Workflow finished successfully",
    });

    expect(completed?.status).toBe("done");
    expect(completed?.summary).toContain("executed");
    expect(completed?.outcome).toContain("successfully");
    expect(completed?.tasks.every((task) => task.status === "done")).toBe(true);
    const persisted = await getTaskPlan("c1");
    expect(persisted?.status).toBe("done");
  });
});
