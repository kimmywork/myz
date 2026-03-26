import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage } from "./conversations"
import {
  countReflectiveVisibleMessages,
  filterReflectiveVisibleMessages,
  isReflectiveVisibleMessage,
} from "./reflectiveMessages"

export type SoulGrowthTraitId =
  | "warmth"
  | "sharpness"
  | "playfulness"
  | "initiative"
  | "expressiveness"
  | "confidence"

export interface SoulGrowthTraitState {
  offset: number
  positiveHits: number
  negativeHits: number
  lastDelta?: number
  updatedAt?: string
}

export interface SoulGrowthAdjustment {
  trait: SoulGrowthTraitId
  delta: number
  reason: string
}

export interface SoulGrowthEvent {
  timestamp: string
  conversationId?: string
  tone: "positive" | "negative" | "directive"
  userExcerpt: string
  assistantExcerpt?: string
  adjustments: SoulGrowthAdjustment[]
}

export interface SoulGrowthState {
  schemaVersion: string
  updatedAt: string
  traits: Record<SoulGrowthTraitId, SoulGrowthTraitState>
  recentEvents: SoulGrowthEvent[]
}

interface TraitDefinition {
  id: SoulGrowthTraitId
  label: string
  low: string
  high: string
  baseHighKeywords: string[]
  baseLowKeywords: string[]
}

const SCHEMA_VERSION = "1.0.0"
const MAX_OFFSET = 5
const MAX_RECENT_EVENTS = 12
const MAX_EVENT_LOG_LINES = 200

const TRAITS: TraitDefinition[] = [
  {
    id: "warmth",
    label: "温柔度",
    low: "冷淡疏离",
    high: "体贴温柔",
    baseHighKeywords: ["温柔", "体贴", "贴心", "照顾", "柔和"],
    baseLowKeywords: ["冷淡", "高冷", "疏离", "克制"],
  },
  {
    id: "sharpness",
    label: "锋芒",
    low: "圆润柔和",
    high: "锋利傲娇",
    baseHighKeywords: ["傲娇", "毒舌", "刻薄", "锋利", "犀利"],
    baseLowKeywords: ["温和", "柔和", "圆润", "包容"],
  },
  {
    id: "playfulness",
    label: "俏皮度",
    low: "克制冷静",
    high: "活泼俏皮",
    baseHighKeywords: ["俏皮", "活泼", "可爱", "灵动"],
    baseLowKeywords: ["冷静", "克制", "沉稳"],
  },
  {
    id: "initiative",
    label: "主动性",
    low: "被动等待",
    high: "主动照顾",
    baseHighKeywords: ["主动", "照顾", "先做", "陪伴", "引导"],
    baseLowKeywords: ["被动", "等待", "少打扰"],
  },
  {
    id: "expressiveness",
    label: "情感外露",
    low: "简洁克制",
    high: "情感外露",
    baseHighKeywords: ["外露", "热情", "情绪", "表达欲"],
    baseLowKeywords: ["简洁", "克制", "冷静", "干净"],
  },
  {
    id: "confidence",
    label: "自信度",
    low: "谨慎收敛",
    high: "自信笃定",
    baseHighKeywords: ["自信", "笃定", "果断", "坚定"],
    baseLowKeywords: ["谨慎", "谦抑", "保守", "小心"],
  },
]

function getGrowthPaths(runtimeRoot: string) {
  return {
    stateDir: resolve(runtimeRoot, "soul"),
    stateFile: resolve(runtimeRoot, "soul", "growth.json"),
    eventFile: resolve(runtimeRoot, "soul", "growth-events.jsonl"),
    archiveDir: resolve(runtimeRoot, "soul", "archive"),
  }
}

function buildDefaultTraits(): Record<SoulGrowthTraitId, SoulGrowthTraitState> {
  return Object.fromEntries(
    TRAITS.map((trait) => [
      trait.id,
      {
        offset: 0,
        positiveHits: 0,
        negativeHits: 0,
      },
    ]),
  ) as Record<SoulGrowthTraitId, SoulGrowthTraitState>
}

export function ensureSoulGrowthRuntime(runtimeRoot: string) {
  const paths = getGrowthPaths(runtimeRoot)
  mkdirSync(paths.stateDir, { recursive: true })
  mkdirSync(paths.archiveDir, { recursive: true })
  if (!existsSync(paths.stateFile)) {
    writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
          updatedAt: new Date().toISOString(),
          traits: buildDefaultTraits(),
          recentEvents: [],
        } satisfies SoulGrowthState,
        null,
        2,
      ),
    )
  }
  if (!existsSync(paths.eventFile)) {
    writeFileSync(paths.eventFile, "")
  }
  return paths
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function snippet(value: string, maxLength = 120) {
  const text = normalizeText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function normalizeJsonBlock(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  return trimmed
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => {
    return text.includes(keyword) ? score + 1 : score
  }, 0)
}

export function inferSoulGrowthBaseProfile(soul: string): Record<SoulGrowthTraitId, number> {
  const text = normalizeText(soul)
  return Object.fromEntries(
    TRAITS.map((trait) => {
      const high = countKeywordHits(text, trait.baseHighKeywords)
      const low = countKeywordHits(text, trait.baseLowKeywords)
      return [trait.id, clamp(high - low, -3, 3)]
    }),
  ) as Record<SoulGrowthTraitId, number>
}

function mergeAdjustments(adjustments: SoulGrowthAdjustment[]) {
  const merged = new Map<SoulGrowthTraitId, SoulGrowthAdjustment>()
  adjustments.forEach((adjustment) => {
    const current = merged.get(adjustment.trait)
    if (!current) {
      merged.set(adjustment.trait, { ...adjustment })
      return
    }
    current.delta = roundToTenth(current.delta + adjustment.delta)
    current.reason = `${current.reason}；${adjustment.reason}`
  })
  return Array.from(merged.values()).filter((item) => item.delta !== 0)
}

type LlmGrowthAnalysis = {
  shouldRecord?: boolean
  tone?: SoulGrowthEvent["tone"] | "neutral"
  feedbackSummary?: string
  assistantSummary?: string
  adjustments?: LlmGrowthAdjustmentDraft[]
}

type LlmGrowthAdjustmentDraft = {
  trait?: string
  delta?: number
  reason?: string
}

function buildGrowthAnalysisPrompt() {
  return [
    "你是一个角色成长分析器。",
    "任务：根据最近一批对话，判断其中是否出现了用户对 assistant 的评价、鼓励、纠偏、调教，尤其是语气、人格、亲密边界、互动风格或行为倾向上的反馈。",
    "如果有，就输出一条聚合后的角色成长调整建议；如果没有，就明确不记录。",
    "",
    "只输出 JSON，不要输出解释，不要输出 Markdown。",
    "JSON schema:",
    "{",
    '  "shouldRecord": boolean,',
    '  "tone": "positive" | "negative" | "directive" | "neutral",',
    '  "feedbackSummary": string,',
    '  "assistantSummary": string,',
    '  "adjustments": [',
    '    { "trait": "warmth" | "sharpness" | "playfulness" | "initiative" | "expressiveness" | "confidence", "delta": number, "reason": string }',
    "  ]",
    "}",
    "",
    "规则：",
    "- 只有当用户消息确实在反馈 assistant 的风格、人格、关系状态、表达方式时，shouldRecord 才为 true。",
    "- 纯任务要求、事实信息、日程安排、普通寒暄，如果没有在反馈 assistant 的风格，不记录。",
    "- praise/认可/喜欢/被理解/被照顾到/觉得贴心/觉得懂我，这些都可以视为 positive。",
    "- 纠偏、批评、希望收一点、不要那么冷/凶/啰嗦/傲娇，这些可视为 negative 或 directive。",
    "- directive 用于用户明确要求往某种风格调整。",
    "- feedbackSummary 要简洁总结本批次里真正相关的用户反馈，不要抄整段原文。",
    "- assistantSummary 概括用户反馈所指向的 assistant 表现；如果无法概括则置空字符串。",
    "- 调整必须渐进，单个 delta 使用 -1.5 到 1.5 之间的小数。",
    "- 最多给 3 个 trait 调整；如果不记录，adjustments 必须为空数组。",
  ].join("\n")
}

export function isGrowthVisibleMessage(message: Message) {
  return isReflectiveVisibleMessage(message)
}

export function countGrowthVisibleMessages(messages: Message[]) {
  return countReflectiveVisibleMessages(messages)
}

function collectGrowthVisibleMessages(messages: Message[]) {
  return filterReflectiveVisibleMessages(messages)
}

export function shouldTriggerSoulGrowthFeedbackBatch(
  messages: Message[],
  interval: number,
) {
  const safeInterval = Math.max(1, interval)
  const visibleCount = countGrowthVisibleMessages(messages)
  return visibleCount > 0 && visibleCount % safeInterval === 0
}

function buildGrowthBatchTranscript(messages: Message[]) {
  return messages
    .map((message) => {
      const label = message.role === "user" ? "user" : "assistant"
      return `${label}: ${snippet(message.content || "", 220)}`
    })
    .join("\n\n")
}

function normalizeLlmAdjustment(adjustment: LlmGrowthAdjustmentDraft) {
  const trait = typeof adjustment?.trait === "string"
    ? adjustment.trait.trim()
    : ""
  if (!TRAITS.some((item) => item.id === trait)) return null
  const rawDelta =
    typeof adjustment?.delta === "number" && Number.isFinite(adjustment.delta)
      ? adjustment.delta
      : 0
  const delta = roundToTenth(clamp(rawDelta, -1.5, 1.5))
  if (!delta) return null
  return {
    trait: trait as SoulGrowthTraitId,
    delta,
    reason:
      typeof adjustment?.reason === "string" && adjustment.reason.trim()
        ? adjustment.reason.trim()
        : "LLM 判定该特质需要渐进调整",
  } satisfies SoulGrowthAdjustment
}

export function parseGrowthAnalysisResponse(content: string) {
  const parsed = JSON.parse(normalizeJsonBlock(content)) as LlmGrowthAnalysis
  const tone = parsed.tone
  const adjustments = Array.isArray(parsed.adjustments)
    ? parsed.adjustments
      .map((item) => normalizeLlmAdjustment(item))
      .filter((item): item is SoulGrowthAdjustment => Boolean(item))
    : []
  const normalizedTone: SoulGrowthEvent["tone"] | "neutral" =
    tone === "positive" || tone === "negative" || tone === "directive"
      ? tone
      : "neutral"
  return {
    shouldRecord: parsed.shouldRecord === true,
    tone: normalizedTone,
    feedbackSummary:
      typeof parsed.feedbackSummary === "string" ? parsed.feedbackSummary.trim() : "",
    assistantSummary:
      typeof parsed.assistantSummary === "string" ? parsed.assistantSummary.trim() : "",
    adjustments: mergeAdjustments(adjustments).slice(0, 3),
  }
}

export async function analyzeSoulGrowthFeedback(options: {
  config: BotRuntimeConfig
  soul: string
  conversationId: string
  messages: Message[]
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}): Promise<SoulGrowthEvent | null> {
  const analysisConfig: BotRuntimeConfig = {
    ...options.config,
    ai: {
      ...options.config.ai,
      capabilities: {
        ...options.config.ai.capabilities,
        toolCalling: false,
        reasoning: false,
      },
      limits: {
        ...options.config.ai.limits,
        maxOutputTokens: Math.min(options.config.ai.limits.maxOutputTokens, 500),
      },
    },
  }
  const messages = [
    createSystemMessage(
      options.conversationId,
      buildGrowthAnalysisPrompt(),
    ),
    createUserMessage(
      options.conversationId,
      [
        "请分析下面这一批最近对话是否应进入角色成长系统。",
        "",
        "当前 SOUL 摘要：",
        snippet(options.soul, 600),
        "",
        "最近对话批次：",
        buildGrowthBatchTranscript(options.messages),
      ].join("\n"),
    ),
  ]
  const completion = options.createCompletion
    ? await options.createCompletion(messages)
    : (await generateReply({
        config: analysisConfig,
        messages,
        conversationId: options.conversationId,
        temperature: 0.1,
      })).content
  const analysis = parseGrowthAnalysisResponse(completion)
  if (!analysis.shouldRecord || analysis.tone === "neutral" || !analysis.adjustments.length) {
    return null
  }

  const latestAssistant = [...options.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.metadata?.type !== "tool_audit")
  const fallbackFeedbackSummary = options.messages
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => snippet(message.content || "", 80))
    .join("；")

  return {
    timestamp: new Date().toISOString(),
    tone: analysis.tone,
    userExcerpt: snippet(analysis.feedbackSummary || fallbackFeedbackSummary),
    assistantExcerpt: analysis.assistantSummary
      ? snippet(analysis.assistantSummary)
      : latestAssistant?.content
        ? snippet(latestAssistant.content)
        : undefined,
    adjustments: analysis.adjustments,
  }
}

export function loadSoulGrowthState(runtimeRoot: string): SoulGrowthState {
  const paths = ensureSoulGrowthRuntime(runtimeRoot)
  try {
    const parsed = JSON.parse(readFileSync(paths.stateFile, "utf-8")) as SoulGrowthState
    return {
      schemaVersion: parsed.schemaVersion || SCHEMA_VERSION,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      traits: {
        ...buildDefaultTraits(),
        ...(parsed.traits || {}),
      },
      recentEvents: Array.isArray(parsed.recentEvents) ? parsed.recentEvents : [],
    }
  } catch {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      traits: buildDefaultTraits(),
      recentEvents: [],
    }
  }
}

function saveSoulGrowthState(runtimeRoot: string, state: SoulGrowthState) {
  const paths = ensureSoulGrowthRuntime(runtimeRoot)
  writeFileSync(paths.stateFile, JSON.stringify(state, null, 2))
}

function appendSoulGrowthEvent(runtimeRoot: string, event: SoulGrowthEvent) {
  const paths = ensureSoulGrowthRuntime(runtimeRoot)
  appendFileSync(paths.eventFile, JSON.stringify(event) + "\n")
  compactSoulGrowthEventLog(runtimeRoot)
}

function compactSoulGrowthEventLog(runtimeRoot: string) {
  const paths = ensureSoulGrowthRuntime(runtimeRoot)
  const raw = readFileSync(paths.eventFile, "utf-8")
  const lines = raw
    .split(/\r?\n/)
    .filter(Boolean)
  if (lines.length <= MAX_EVENT_LOG_LINES) return

  const archiveLines = lines.slice(0, lines.length - MAX_EVENT_LOG_LINES)
  const keptLines = lines.slice(-MAX_EVENT_LOG_LINES)
  const archivePath = resolve(
    paths.archiveDir,
    `growth-events-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
  )
  writeFileSync(archivePath, `${archiveLines.join("\n")}\n`)
  writeFileSync(paths.eventFile, `${keptLines.join("\n")}\n`)
}

function applyAdjustment(
  trait: SoulGrowthTraitState,
  delta: number,
) {
  const distance = Math.abs(trait.offset)
  const damping = 1 / (1 + distance / 3)
  const applied = roundToTenth(delta * damping)
  const nextOffset = clamp(roundToTenth(trait.offset + applied), -MAX_OFFSET, MAX_OFFSET)
  return {
    ...trait,
    offset: nextOffset,
    lastDelta: applied,
    updatedAt: new Date().toISOString(),
    positiveHits: trait.positiveHits + (applied > 0 ? 1 : 0),
    negativeHits: trait.negativeHits + (applied < 0 ? 1 : 0),
  }
}

export async function recordSoulGrowthFeedback(options: {
  config: BotRuntimeConfig
  runtimeRoot: string
  soul: string
  conversationId: string
  messages: Message[]
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}) {
  const event = await analyzeSoulGrowthFeedback({
    config: options.config,
    soul: options.soul,
    conversationId: options.conversationId,
    messages: options.messages,
    createCompletion: options.createCompletion,
  })
  if (!event) return null

  const state = loadSoulGrowthState(options.runtimeRoot)
  const nextTraits = { ...state.traits }
  const appliedAdjustments = event.adjustments.map((adjustment) => {
    const current = nextTraits[adjustment.trait] || {
      offset: 0,
      positiveHits: 0,
      negativeHits: 0,
    }
    const updated = applyAdjustment(current, adjustment.delta)
    nextTraits[adjustment.trait] = updated
    return {
      ...adjustment,
      delta: updated.lastDelta || adjustment.delta,
    }
  })

  const storedEvent: SoulGrowthEvent = {
    ...event,
    conversationId: options.conversationId,
    adjustments: appliedAdjustments,
  }

  const nextState: SoulGrowthState = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: storedEvent.timestamp,
    traits: nextTraits,
    recentEvents: [storedEvent, ...state.recentEvents].slice(0, MAX_RECENT_EVENTS),
  }
  saveSoulGrowthState(options.runtimeRoot, nextState)
  appendSoulGrowthEvent(options.runtimeRoot, storedEvent)
  return storedEvent
}

export function renderSoulGrowthContext(runtimeRoot: string, soul: string) {
  const state = loadSoulGrowthState(runtimeRoot)
  const baseProfile = inferSoulGrowthBaseProfile(soul)
  const rankedTraits = TRAITS.map((trait) => {
    const offset = state.traits[trait.id]?.offset || 0
    const effective = clamp(baseProfile[trait.id] + offset, -5, 5)
    return {
      trait,
      effective,
      offset,
    }
  })
    .sort((left, right) => Math.abs(right.offset) - Math.abs(left.offset))
    .filter((entry) => Math.abs(entry.offset) >= 0.4)
    .slice(0, 3)

  const traitLines = rankedTraits.length
    ? rankedTraits.map((entry) => {
        const direction = entry.effective >= 0 ? entry.trait.high : entry.trait.low
        return `- ${entry.trait.label}：当前更偏向 ${direction}（相对基础人设变化 ${entry.offset > 0 ? "+" : ""}${entry.offset.toFixed(1)}）`
      })
    : ["- 当前仍基本贴近基础 SOUL，成长变化较小。"]

  const eventLines = state.recentEvents.slice(0, 2).map((event) => {
    const reasons = event.adjustments
      .map((adjustment) => {
        const trait = TRAITS.find((item) => item.id === adjustment.trait)
        return `${trait?.label || adjustment.trait}${adjustment.delta > 0 ? "+" : ""}${adjustment.delta.toFixed(1)}`
      })
      .join("，")
    return `- ${event.userExcerpt} -> ${reasons}`
  })

  return [
    "角色成长状态（在基础 SOUL 之上渐进调节，不替代核心身份）：",
    ...traitLines,
    eventLines.length ? "最近反馈：" : "",
    ...eventLines,
    "成长边界：保持身份连续性与核心关系不变；允许沿用户长期反馈逐步强化或减弱气质，但不允许一轮对话导致人格突变。",
  ]
    .filter(Boolean)
    .join("\n")
}
