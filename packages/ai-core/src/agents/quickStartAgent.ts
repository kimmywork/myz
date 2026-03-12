import type { AIModelSetting, MaxOutputTokenParam } from "../settings"
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderMessage,
} from "../providers/types"
import { isRecord } from "@myz/shared/typeUtils"

export interface QuickStartTaskSpec {
  title: string
  deliverables: Array<{ description: string }>
  priority?: "low" | "medium" | "high"
  owner?: "planner" | "executor" | "research" | "automation" | "review"
  blockedBy?: string[]
  blocks?: string[]
  category?: "quick" | "research" | "automation" | "reasoning"
  skills?: string[]
}

export type QuickStartResult = {
  type: "plan"
  tasks: QuickStartTaskSpec[]
  assumptions?: string[]
  mode?: "quick" | "orchestrated"
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

function normalizeMaxOutput(model: AIModelSetting, fallback = 320, cap = 480) {
  const max =
    typeof model?.limits?.maxOutputTokens === "number"
      ? model.limits.maxOutputTokens
      : fallback
  return Math.max(128, Math.min(cap, Math.floor(max || fallback)))
}

function buildSystemPrompt() {
  return [
    "你是 QuickStart。",
    "目标：用一句话需求直接生成可执行任务计划。",
    "不要向用户提问；缺失信息做合理假设并写入 assumptions，或转成前置任务交付物。",
    "只输出 JSON。",
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
    "1) 不提问；缺信息转为前置任务或 assumptions。",
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

function normalizeTasks(input: unknown): QuickStartTaskSpec[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const entry = isRecord(item) ? item : {}
      const title = typeof entry.title === "string" ? entry.title.trim() : ""
      const rawDeliverables = Array.isArray(entry.deliverables)
        ? entry.deliverables
        : []
      const deliverables = rawDeliverables
        .map((deliverable) => {
          const record = isRecord(deliverable) ? deliverable : {}
          return {
            description:
              typeof record.description === "string"
                ? record.description.trim()
                : "",
          }
        })
        .filter((deliverable) => deliverable.description)
      if (!title) return null
      const spec: QuickStartTaskSpec = {
        title,
        deliverables,
      }
      if (
        entry.priority === "low" ||
        entry.priority === "medium" ||
        entry.priority === "high"
      ) {
        spec.priority = entry.priority
      }
      if (
        entry.owner === "planner" ||
        entry.owner === "executor" ||
        entry.owner === "research" ||
        entry.owner === "automation" ||
        entry.owner === "review"
      ) {
        spec.owner = entry.owner
      }
      if (Array.isArray(entry.blockedBy)) {
        const blockedBy = entry.blockedBy.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        if (blockedBy.length) {
          spec.blockedBy = blockedBy
        }
      }
      if (Array.isArray(entry.blocks)) {
        const blocks = entry.blocks.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        if (blocks.length) {
          spec.blocks = blocks
        }
      }
      if (
        entry.category === "quick" ||
        entry.category === "research" ||
        entry.category === "automation" ||
        entry.category === "reasoning"
      ) {
        spec.category = entry.category
      }
      if (Array.isArray(entry.skills)) {
        const skills = entry.skills.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        if (skills.length) {
          spec.skills = skills
        }
      }
      return spec
    })
    .filter((item): item is QuickStartTaskSpec => Boolean(item))
}

function buildFallbackPlan(): QuickStartTaskSpec[] {
  return [
    {
      title: "补齐执行前提并开始探索",
      deliverables: [{ description: "补齐目标、约束、验收标准或账号权限" }],
    },
  ]
}

export class QuickStartAgent {
  async createPlan(options: {
    prompt: string
    client: ChatCompletionClient
    model: AIModelSetting
  }): Promise<QuickStartResult> {
    const maxOutputTokens = normalizeMaxOutput(options.model, 320, 480)
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens"

    const baseMessages: ProviderMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(options.prompt) },
    ]
    const messages = injectSystemPromptAsUserMessage(
      baseMessages,
      Boolean(options.model?.systemPromptInUserMessage),
    )
    const request: ProviderChatCompletionRequest = {
      model: options.model.model,
      messages,
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

    const tasks = normalizeTasks(parsed?.tasks)
    const assumptions = Array.isArray(parsed?.assumptions)
      ? parsed.assumptions
          .map((item: unknown) =>
            typeof item === "string" ? item.trim() : "",
          )
          .filter(Boolean)
      : []
    return {
      type: "plan",
      tasks: tasks.length ? tasks : buildFallbackPlan(),
      assumptions,
    }
  }
}
