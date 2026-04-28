import { beforeEach, describe, expect, it, vi } from "vitest"
import { LOCAL_TOOL_HANDLERS } from "@/background/ai/tools/local.ts"
import type { TextContent } from "@/background/mcp_schema"
import { isRecord } from "@/shared/typeUtils"

type ConversationRecord = { metadata: Record<string, any> }
let conversationStore: ConversationRecord = { metadata: {} }

vi.mock("@/sidepanel/aiStorage", () => {
  return {
    getConversation: vi.fn(async () => conversationStore),
    updateConversationMetadata: vi.fn(async (_id: string, data: any) => {
      conversationStore = {
        ...conversationStore,
        metadata: { ...(conversationStore.metadata || {}), ...(data || {}) },
      }
      return true
    }),
  }
})

vi.mock("@/background/storage.js", () => ({
  readSettings: vi.fn(async () => ({
    aiAssistantEnabled: true,
    aiMcpServers: [],
    aiAgents: { conversation: {} },
  })),
}))

vi.mock("@/background/ai/runtime/agentSelection.js", () => ({
  resolveAgentTarget: vi.fn(() => ({
    provider: { id: "p1" },
    model: {
      model: "gpt-4",
      limits: { maxOutputTokens: 100 },
      capabilities: { toolCalling: false },
    },
    temperature: 0.2,
  })),
}))

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
}))

vi.mock("@/background/ai/skills/storage.js", () => ({
  listSkills: vi.fn(async () => [
    {
      id: "planning-mode",
      name: "planning-mode",
      description: "planning mode",
      enabled: true,
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
  ]),
  getSkillFile: vi.fn(async (skillId: string, path: string) => {
    if (skillId === "planning-mode" && path === "SKILL.md") {
      return {
        skillId,
        path,
        content: "## 规划原则\nTask.init\n",
        encoding: "utf-8",
        updatedAt: "2026-04-28T00:00:00.000Z",
      }
    }
    return null
  }),
  listSkillFiles: vi.fn(async (skillId: string) => {
    if (skillId === "planning-mode") {
      return [
        {
          skillId,
          path: "SKILL.md",
          content: "## 规划原则\nTask.init\n",
          encoding: "utf-8",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
      ]
    }
    return []
  }),
}))

beforeEach(() => {
  conversationStore = { metadata: {} }
  ;(globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn(),
    },
  }
  vi.clearAllMocks()
})

describe("Task tool", () => {
  it("reads the builtin planning-mode skill file", async () => {
    const readTool = LOCAL_TOOL_HANDLERS.Read
    const result = await readTool({
      path: "/skills/planning-mode/SKILL.md",
    })
    const text = String((result.content?.[0] as TextContent)?.text || "")
    expect(result.isError).not.toBe(true)
    expect(text).toContain("规划原则")
    expect(text).toContain("Task.init")
  })

  it("initializes and lists tasks", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task

    const initResult = await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        goal: "测试任务",
        tasks: [{ title: "任务 A", summary: "先读取页面" }],
      },
    })

    const initData = isRecord(initResult.data) ? initResult.data : {}
    const initTasks = Array.isArray(initData.tasks) ? initData.tasks : []
    expect(initData.status).toBe("planning")
    expect(initTasks.length).toBe(1)

    const listResult = await taskTool({
      conversationId: "c1",
      payload: { action: "list", onlyUnblocked: false },
    })

    const listData = Array.isArray(listResult.data) ? listResult.data : []
    expect(listData.length).toBe(1)
  })

  it("updates task summary, notes and outcome", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task

    const initResult = await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        goal: "测试任务",
        tasks: [{ title: "任务 A" }],
      },
    })

    const initData = isRecord(initResult.data) ? initResult.data : {}
    const initTasks = Array.isArray(initData.tasks) ? initData.tasks : []
    const firstTask = isRecord(initTasks[0]) ? initTasks[0] : {}
    const taskId =
      typeof firstTask.id === "string" ? firstTask.id : undefined

    const updateResult = await taskTool({
      conversationId: "c1",
      payload: {
        action: "update",
        taskId,
        status: "done",
        summary: "已完成页面读取",
        note: "记录了关键字段",
        outcome: "可以继续下一步",
      },
    })

    const updateData = isRecord(updateResult.data) ? updateResult.data : {}
    const updatedTasks = Array.isArray(updateData.tasks) ? updateData.tasks : []
    const updated = isRecord(updatedTasks[0]) ? updatedTasks[0] : {}
    const notes = Array.isArray(updated.notes) ? updated.notes : []
    expect(updated.status).toBe("done")
    expect(updated.summary).toBe("已完成页面读取")
    expect(notes).toContain("记录了关键字段")
    expect(updated.outcome).toBe("可以继续下一步")
  })

  it("infers list action for empty payloads", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task

    await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        goal: "测试任务",
        tasks: [{ title: "任务 A" }],
      },
    })

    const result = await taskTool({ conversationId: "c1" })

    expect(Array.isArray(result.data)).toBe(true)
    if (Array.isArray(result.data)) {
      expect(result.data.length).toBe(1)
    }
    expect((result.content?.[0] as TextContent)?.text).toContain(
      "提示: 调用 Task 时请提供 action 字段",
    )
  })

  it("completes all tasks without validator gating", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task

    await taskTool({
      conversationId: "c1",
      payload: {
        action: "init",
        goal: "测试任务",
        tasks: [{ title: "任务 A" }],
      },
    })

    const resultOk = await taskTool({
      conversationId: "c1",
      payload: {
        action: "complete_all",
        summary: "所有任务均已完成",
        outcome: "流程结束",
      },
    })
    expect(resultOk.isError).not.toBe(true)
    const okData = isRecord(resultOk.data) ? resultOk.data : {}
    expect(okData.status).toBe("done")
    expect(okData.outcome).toBe("流程结束")
  })

  it("handles Claude Code Task compatibility payloads", async () => {
    const taskTool = LOCAL_TOOL_HANDLERS.Task

    const result = await taskTool({
      conversationId: "c1",
      payload: {
        subagent_type: "research",
        description: "检索资料",
        prompt: "总结这段材料的要点",
      },
    })

    const data = isRecord(result.data) ? result.data : {}
    const compat = isRecord(data.compat) ? data.compat : {}
    expect(data.output).toBe("done")
    expect(compat.subagent_type).toBe("research")
  })
})
