import { AUTO_HIGHLIGHT_CATEGORIES, HIGHLIGHT_STYLES } from "@myz/shared/types"

export const AI_PROVIDER_TYPES = [
  "openai_compatible",
  "openai_responses",
  "gemini",
  "anthropic",
  "mistral",
] as const

export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number]

export const OPENAI_COMPATIBLE_PROFILES = [
  "auto",
  "deepseek",
  "moonshot",
  "glm",
  "qwen",
  "minimax",
  "longcat",
  "mimo",
  "custom",
] as const

export type OpenAICompatibleProfile =
  (typeof OPENAI_COMPATIBLE_PROFILES)[number]

export const AI_REASONING_MODES = [
  "provider_default",
  "enabled",
  "disabled",
] as const

export type AIReasoningMode = (typeof AI_REASONING_MODES)[number]

export const AI_REASONING_EFFORT_SETTINGS = [
  "provider_default",
  "low",
  "medium",
  "high",
] as const

export type AIReasoningEffortSetting =
  (typeof AI_REASONING_EFFORT_SETTINGS)[number]

export const MAX_OUTPUT_TOKEN_PARAMS = [
  "max_tokens",
  "max_completion_tokens",
] as const
export type MaxOutputTokenParam = (typeof MAX_OUTPUT_TOKEN_PARAMS)[number]

export const AI_TOOL_CHOICE_MODES = ["auto", "none", "required", "tool"] as const
export type AIToolChoiceMode = (typeof AI_TOOL_CHOICE_MODES)[number]

export const AI_TOOL_FLAG_SETTINGS = ["auto", "on", "off"] as const
export type AIToolFlagSetting = (typeof AI_TOOL_FLAG_SETTINGS)[number]

export const AI_TOOL_SELECTION_MODES = ["manual", "auto"] as const
export type AIToolSelectionMode = (typeof AI_TOOL_SELECTION_MODES)[number]

export interface AIModelCapabilities {
  vision: boolean
  imageOutput: boolean
  toolCalling: boolean
  reasoning: boolean
}

export interface AIModelLimits {
  contextWindow: number
  maxOutputTokens: number
  maxOutputTokenParam: MaxOutputTokenParam
}

export interface AIToolChoiceSetting {
  mode: AIToolChoiceMode
  toolName?: string
}

export interface AIToolControlSettings {
  toolChoice: AIToolChoiceSetting
  strict: AIToolFlagSetting
  parallelToolCalls: AIToolFlagSetting
}

export interface AIModelSetting {
  id: string
  model: string
  enabled: boolean
  capabilities: AIModelCapabilities
  limits: AIModelLimits
  tooling: AIToolControlSettings
  systemPromptInUserMessage?: boolean
}

export interface AIProviderLastTestStatus {
  ok: boolean
  message: string
  testedAt: string
  model: string
}

export interface AIProviderSetting {
  id: string
  name: string
  type: AIProviderType
  enabled: boolean
  streamingEnabled?: boolean
  compatProfile?: OpenAICompatibleProfile
  reasoningMode?: AIReasoningMode
  reasoningEffort?: AIReasoningEffortSetting
  reasoningBudget?: number
  baseUrl: string
  apiKey: string
  headers: string
  models: AIModelSetting[]
  lastTest: AIProviderLastTestStatus | null
}

export interface AIAgentModelRef {
  providerId: string
  modelId: string
}

export interface AIAgentConfig {
  target: AIAgentModelRef | null
  temperature: number
  compressImages?: boolean
  superpowerMode?: boolean
  maxHighlights?: number
  multimodalTarget?: AIAgentModelRef | null
  contextCompressionThreshold?: number
}

export type AutoHighlightCategory = `${AUTO_HIGHLIGHT_CATEGORIES}`

export interface AutoHighlightCategoryStyle {
  style: HIGHLIGHT_STYLES
  color: string
}

export type AutoHighlightCategoryStyles = Record<
  AutoHighlightCategory,
  AutoHighlightCategoryStyle
>

export interface AutoHighlightAgentConfig extends AIAgentConfig {
  categoryStyles?: AutoHighlightCategoryStyles
}

export interface AIAgentsSettings {
  conversation: AIAgentConfig
  insights: AIAgentConfig
  autoHighlight: AutoHighlightAgentConfig
}

export interface McpServerSetting {
  id: string
  name: string
  enabled: boolean
  url: string
  headers?: Record<string, string>
  lastTest?: {
    ok: boolean
    message: string
    testedAt: string
  } | null
}

export interface AIAssistantSettings {
  aiProviders: AIProviderSetting[]
  aiAgents: AIAgentsSettings
}
