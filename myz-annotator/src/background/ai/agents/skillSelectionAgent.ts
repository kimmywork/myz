import type { ChatCompletionClient } from "../providers/types.js"
import type { AIModelSetting, MaxOutputTokenParam } from "../../settings.js"

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

function normalizeMaxOutput(
  model: AIModelSetting,
  fallback = 128,
  cap = 256,
) {
  const max =
    typeof model?.limits?.maxOutputTokens === "number" ? model.limits.maxOutputTokens : fallback
  return Math.max(16, Math.min(cap, Math.floor(max || fallback)))
}

function buildSystemPrompt() {
  return [
    "你是一个“Skill 选择器”，负责根据用户输入，从候选 Skill 中选择本次对话需要启用的技能。",
    "",
    "原则：",
    "- 默认不启用 Skill；只有在确实需要、且能明显提升回答质量时才选择。",
    "- 只允许从候选列表中选择；不要发明 skill 名称。",
    "- 可以输出空数组。",
    "",
    "输出格式：只输出 JSON，不要输出其他文本。",
    'JSON 结构：{ "skill_names": ["skill-a", "skill-b"] }',
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
        .map((skill) => (typeof skill?.name === "string" ? skill.name.trim() : ""))
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

    const request: any = {
      model: options.model.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(options.prompt, options.skills || []),
        },
      ],
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

    const skillNames = Array.isArray(parsed?.skill_names) ? parsed.skill_names : []
    const normalized = skillNames
      .filter((name: any) => typeof name === "string" && name.trim())
      .map((name: string) => name.trim())
      .filter((name: string) => candidateNames.has(name))

    return Array.from(new Set(normalized))
  }
}
