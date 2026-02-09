import type { ChatCompletionClient } from "../providers/types.js"
import type { AIModelSetting, MaxOutputTokenParam } from "../../settings.js"

export interface PlanningTaskSpec {
  title: string
  deliverables: Array<{ description: string }>
  priority?: "low" | "medium" | "high"
  owner?: "planner" | "executor" | "research" | "automation" | "review"
  blockedBy?: string[]
  blocks?: string[]
  category?: "quick" | "research" | "automation" | "reasoning"
  skills?: string[]
}

export type PlanningResult = {
  type: "plan"
  tasks: PlanningTaskSpec[]
  assumptions?: string[]
}

function extractFirstJsonObject(text: string) {
  const raw = typeof text === "string" ? text : ""
  if (!raw.trim()) return null
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null
  }
  const slice = raw.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(slice)
  } catch {
    return null
  }
}

function normalizeMaxOutput(
  model: AIModelSetting,
  fallback = 384,
  cap = 512,
) {
  const max = typeof model?.limits?.maxOutputTokens === "number" ? model.limits.maxOutputTokens : fallback
  return Math.max(128, Math.min(cap, Math.floor(max || fallback)))
}

function buildSystemPrompt() {
  return [
    "你是任务规划器（Planner）。",
    "只输出 JSON，不要输出解释或多余文本。",
  ].join("\n")
}

function buildUserPrompt(prompt: string) {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : ""
  const now = new Date()
  const timeZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"
      : "Asia/Shanghai"
  return [
    "目标：将用户需求拆解为可执行任务，并为每个任务定义可验收交付物。",
    "环境：浏览器扩展（MV3），可控浏览器、读取页面、使用技能与搜索工具。",
    `时间：${now.toISOString()}（${timeZone}）。`,
    "",
    "规则：",
    "1) 不进入澄清模式；缺信息转为前置任务。",
    "2) 任务尽量少且可执行；交付物清晰、可验证。",
    "3) 可在任务项中补充 priority/owner/category/skills/blockedBy/blocks。",
    "4) blockedBy/blocks 使用任务序号（1-based）或标题，不要自造 ID。",
    "5) 仅输出 JSON。",
    "",
    "输出格式：",
    '{ "type": "plan", "tasks": [{ "title": "...", "deliverables": [{ "description": "..." }] }], "assumptions": ["..."] }',
    "",
    "用户需求：",
    normalizedPrompt || "(空)",
  ].join("\n")
}

function normalizeTasks(input: any): PlanningTaskSpec[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const title = typeof item?.title === "string" ? item.title.trim() : ""
      const rawDeliverables = Array.isArray(item?.deliverables) ? item.deliverables : []
      const deliverables = rawDeliverables
        .map((deliverable: any) => ({
          description:
            typeof deliverable?.description === "string" ? deliverable.description.trim() : "",
        }))
        .filter((deliverable: any) => deliverable.description)
      if (!title) return null
      return {
        title,
        deliverables,
        priority:
          item?.priority === "high" || item?.priority === "low" ? item.priority : undefined,
        owner:
          item?.owner === "planner" ||
          item?.owner === "executor" ||
          item?.owner === "research" ||
          item?.owner === "automation" ||
          item?.owner === "review"
            ? item.owner
            : undefined,
        blockedBy: Array.isArray(item?.blockedBy)
          ? item.blockedBy.filter((value: any) => typeof value === "string" && value.trim())
          : undefined,
        blocks: Array.isArray(item?.blocks)
          ? item.blocks.filter((value: any) => typeof value === "string" && value.trim())
          : undefined,
        category:
          item?.category === "research" ||
          item?.category === "automation" ||
          item?.category === "reasoning"
            ? item.category
            : undefined,
        skills: Array.isArray(item?.skills)
          ? item.skills.filter((value: any) => typeof value === "string" && value.trim())
          : undefined,
      }
    })
    .filter(Boolean) as PlanningTaskSpec[]
}

function buildFallbackPlanFromQuestions(questions: string[]): PlanningTaskSpec[] {
  const deliverables = questions
    .map((question) => ({
      description: `补齐关键信息：${question}`,
    }))
    .filter((item) => item.description)
  return [
    {
      title: "补齐关键信息并建立执行前提",
      deliverables: deliverables.length
        ? deliverables
        : [{ description: "补齐缺失上下文并确认执行约束" }],
    },
  ]
}

export class PlanningAgent {
  async createPlan(options: {
    prompt: string
    client: ChatCompletionClient
    model: AIModelSetting
  }): Promise<PlanningResult> {
    const maxOutputTokens = normalizeMaxOutput(options.model, 384, 512)
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens"

    const request: any = {
      model: options.model.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(options.prompt) },
      ],
      temperature: 0.2,
      stream: false,
    }
    if (maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = maxOutputTokens
    } else {
      request.max_tokens = maxOutputTokens
    }

    const response = await options.client.createCompletion(request, {
      enableGeminiThinking: Boolean(options.model?.capabilities?.reasoning),
    })
    const text = String(response?.choices?.[0]?.message?.content || "").trim()
    const parsed = extractFirstJsonObject(text)

    if (parsed?.type === "clarify") {
      const questions = Array.isArray(parsed?.questions)
        ? parsed.questions.map((q: any) => (typeof q === "string" ? q.trim() : "")).filter(Boolean)
        : []
      return { type: "plan", tasks: buildFallbackPlanFromQuestions(questions) }
    }

    const tasks = normalizeTasks(parsed?.tasks)
    const assumptions = Array.isArray(parsed?.assumptions)
      ? parsed.assumptions.map((item: any) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : []
    return { type: "plan", tasks, assumptions }
  }
}
