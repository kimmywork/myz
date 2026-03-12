import type { AIModelSetting, MaxOutputTokenParam } from "../settings"
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderMessage,
} from "../providers/types"

export interface SkillSelectionCandidate {
  name: string
  description?: string
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

function normalizeMaxOutput(model: AIModelSetting, fallback = 128, cap = 256) {
  const max =
    typeof model?.limits?.maxOutputTokens === "number"
      ? model.limits.maxOutputTokens
      : fallback
  return Math.max(16, Math.min(cap, Math.floor(max || fallback)))
}

function buildSystemPrompt() {
  return [
    "你是 Skill 选择器。",
    "任务：从候选 Skill 中选出本次对话需要启用的最小集合。",
    "原则：默认空；只从候选列表选择；用户明确要求时优先启用对应 Skill。",
    '仅输出 JSON：{ "skill_names": ["..."] }',
  ].join("\n")
}

function buildUserPrompt(prompt: string, skills: SkillSelectionCandidate[]) {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : ""
  const serializedSkills = JSON.stringify(
    (skills || []).map((skill) => ({
      name: skill.name,
      description: skill.description || "",
    })),
    null,
    2,
  )

  return [
    "用户输入：",
    normalizedPrompt || "(空)",
    "",
    "候选 Skill 列表（JSON）：",
    serializedSkills,
    "",
    "请返回本次需要启用的 skill_names（可为空数组）。",
  ].join("\n")
}

export class SkillSelectionAgent {
  async selectSkillNames(options: {
    prompt: string
    skills: SkillSelectionCandidate[]
    client: ChatCompletionClient
    model: AIModelSetting
  }): Promise<string[]> {
    const candidateNames = new Set(
      (options.skills || [])
        .map((skill) =>
          typeof skill?.name === "string" ? skill.name.trim() : "",
        )
        .filter(Boolean),
    )
    if (!candidateNames.size) {
      return []
    }

    const maxOutputTokens = normalizeMaxOutput(options.model, 128, 256)
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens"

    const baseMessages: ProviderMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(options.prompt, options.skills || []),
      },
    ]
    const messages = injectSystemPromptAsUserMessage(
      baseMessages,
      Boolean(options.model?.systemPromptInUserMessage),
    )
    const request: ProviderChatCompletionRequest = {
      model: options.model.model,
      messages,
      temperature: 0.0,
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
    const parsed = extractFirstJsonObject(text)

    const skillNames = Array.isArray(parsed?.skill_names)
      ? parsed.skill_names
      : []
    const normalized = skillNames
      .filter(
        (name: unknown): name is string =>
          typeof name === "string" && name.trim().length > 0,
      )
      .map((name: string) => name.trim())
      .filter((name: string) => candidateNames.has(name))

    return Array.from(new Set(normalized))
  }
}
