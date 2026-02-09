import type { ChatCompletionClient } from "../providers/types.js"
import type { AIModelSetting, MaxOutputTokenParam } from "../../settings.js"
import type { TaskPlan, TaskValidationResult } from "../tasks/taskManager.js"

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
    "你是验证器（Validator）。",
    "目标：基于原始需求与交付物完成情况判断是否达标。",
    "规则：期望与交付物权重 1:1；明显不足即 fail；只输出 JSON。",
    "输出：{ \"status\": \"pass|fail\", \"expectationScore\": 0-100, \"deliverableScore\": 0-100, \"issues\": [], \"missingDeliverables\": [] }",
  ].join("\n")
}

function buildUserPrompt(options: { originalUserRequest: string; taskPlan: TaskPlan }) {
  const payload = JSON.stringify(
    {
      originalUserRequest: options.originalUserRequest,
      taskPlan: options.taskPlan,
    },
    null,
    2,
  )
  return [
    "请根据以下信息进行验证：",
    payload,
    "",
    "请输出 JSON。",
  ].join("\n")
}

function normalizeScore(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

export class ValidatorAgent {
  async validate(options: {
    originalUserRequest: string
    taskPlan: TaskPlan
    client: ChatCompletionClient
    model: AIModelSetting
  }): Promise<TaskValidationResult> {
    const maxOutputTokens = normalizeMaxOutput(options.model, 384, 512)
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens"

    const request: any = {
      model: options.model.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt({
            originalUserRequest: options.originalUserRequest,
            taskPlan: options.taskPlan,
          }),
        },
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
      enableGeminiThinking: Boolean(options.model.capabilities.reasoning),
    })
    const text = String(response?.choices?.[0]?.message?.content || "").trim()
    const parsed = extractFirstJsonObject(text) || {}

    const status = parsed.status === "pass" ? "pass" : "fail"
    const expectationScore = normalizeScore(parsed.expectationScore)
    const deliverableScore = normalizeScore(parsed.deliverableScore)
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map((item: any) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : []
    const missingDeliverables = Array.isArray(parsed.missingDeliverables)
      ? parsed.missingDeliverables
          .map((item: any) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : []

    return {
      status,
      expectationScore,
      deliverableScore,
      issues,
      missingDeliverables,
    }
  }
}
