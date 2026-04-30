import type { SyncConfig } from "@myz/dashboard-core/host"
import {
  DEFAULT_COLOR,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  type HIGHLIGHT_STYLES as HighlightStyle,
} from "@myz/shared"

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

export const AI_TOOL_CHOICE_MODES = [
  "auto",
  "none",
  "required",
  "tool",
] as const

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

export interface AILocalToolsSettings {
  enabledToolNames: string[]
  mode: AIToolSelectionMode
  autoSelectorTarget: AIAgentModelRef | null
}

export interface AISkillsSettings {
  mode: AIToolSelectionMode
  autoSelectorTarget: AIAgentModelRef | null
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

export type HighlightStyleValue = HighlightStyle

export interface AutoHighlightCategoryStyle {
  style: HighlightStyle
  color: string
}

export interface AutoHighlightCategoryStyles {
  conceptual: AutoHighlightCategoryStyle
  structural: AutoHighlightCategoryStyle
  behavioural: AutoHighlightCategoryStyle
}

export interface AutoHighlightAgentConfig extends AIAgentConfig {
  categoryStyles?: AutoHighlightCategoryStyles
}

export interface AIAgentsSettings {
  conversation: AIAgentConfig
  insights: AIAgentConfig
  autoHighlight: AutoHighlightAgentConfig
}

export interface VectorSearchLastTestStatus {
  ok: boolean
  message: string
  testedAt: string
  providerId: string
  modelId: string
  model: string
}

export interface VectorSettings {
  enabled: boolean
  target: AIAgentModelRef | null
  lastTest: VectorSearchLastTestStatus | null
  matchThreshold: number
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

export interface SocialImportProviderSettings {
  profileUrl: string
}

export interface SocialImportSettings {
  twitter: SocialImportProviderSettings
  mastodon: SocialImportProviderSettings
}

export interface DesktopAgentSettings {
  personaName: string
  rolePrompt: string
}

export interface SyncS3Settings {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  prefix?: string
}

export interface SyncSettings {
  enabled: boolean
  s3: SyncS3Settings
}

export interface DesktopStoredSettings {
  dashboardView: "cards" | "list"
  colorPalette: string[]
  lastUsedColor: string
  lastUsedStyle: HighlightStyle
  aiAssistantEnabled: boolean
  aiProviders: AIProviderSetting[]
  aiAgents: AIAgentsSettings
  aiMcpServers: McpServerSetting[]
  aiLocalTools: AILocalToolsSettings
  aiSkills: AISkillsSettings
  vectorSearch: VectorSettings
  socialImport: SocialImportSettings
  desktopAgent: DesktopAgentSettings
}

export interface DesktopSettings extends DesktopStoredSettings {
  sync: SyncSettings
}

export interface LocalToolDefinition {
  name: string
  description: string
}

export const LOCAL_TOOL_DEFINITIONS: LocalToolDefinition[] = [
  {
    name: "List",
    description: "列出 workspace 内的目录和文件。",
  },
  {
    name: "Read",
    description: "读取 workspace 内的文本文件。",
  },
  {
    name: "Write",
    description: "在 workspace 内创建、覆盖或追加文本文件。",
  },
  {
    name: "Edit",
    description: "在 workspace 内按字符串替换文件内容。",
  },
  {
    name: "Glob",
    description: "按 glob 模式检索 workspace 内的路径。",
  },
]

export const LOCAL_TOOL_NAMES = LOCAL_TOOL_DEFINITIONS.map((tool) => tool.name)

export function createDefaultSyncSettings(): SyncSettings {
  return {
    enabled: false,
    s3: {
      endpoint: "",
      region: "",
      bucket: "",
      accessKeyId: "",
      secretAccessKey: "",
      sessionToken: "",
      prefix: "myz-desktop",
    },
  }
}

export function createDefaultDesktopStoredSettings(): DesktopStoredSettings {
  return {
    dashboardView: "cards",
    colorPalette: [...DEFAULT_COLORS],
    lastUsedColor: DEFAULT_COLOR,
    lastUsedStyle: DEFAULT_HIGHLIGHT_STYLE,
    aiAssistantEnabled: false,
    aiProviders: [],
    aiAgents: {
      conversation: {
        target: null,
        temperature: 0.7,
        compressImages: false,
        multimodalTarget: null,
        superpowerMode: false,
        contextCompressionThreshold: 80,
      },
      insights: { target: null, temperature: 0.7 },
      autoHighlight: {
        target: null,
        temperature: 0.4,
        maxHighlights: 15,
        categoryStyles: {
          conceptual: {
            style: HIGHLIGHT_STYLES.PAINT,
            color: DEFAULT_COLORS[0],
          },
          structural: {
            style: HIGHLIGHT_STYLES.UNDERLINE,
            color: DEFAULT_COLORS[3] || DEFAULT_COLORS[0],
          },
          behavioural: {
            style: HIGHLIGHT_STYLES.WAVY,
            color: DEFAULT_COLORS[1] || DEFAULT_COLORS[0],
          },
        },
      },
    },
    aiMcpServers: [],
    aiLocalTools: {
      enabledToolNames: LOCAL_TOOL_NAMES.slice(),
      mode: "manual",
      autoSelectorTarget: null,
    },
    aiSkills: {
      mode: "manual",
      autoSelectorTarget: null,
    },
    vectorSearch: {
      enabled: false,
      target: null,
      lastTest: null,
      matchThreshold: 0.5,
    },
    socialImport: {
      twitter: {
        profileUrl: "",
      },
      mastodon: {
        profileUrl: "",
      },
    },
    desktopAgent: {
      personaName: "MyZ Desktop Agent",
      rolePrompt:
        "你是一个本地优先的桌面 Agent。回答时优先给出可执行、可验证的下一步，并明确区分你已经完成的内容与需要用户手动执行的内容。",
    },
  }
}

export function createDefaultDesktopSettings(): DesktopSettings {
  return {
    ...createDefaultDesktopStoredSettings(),
    sync: createDefaultSyncSettings(),
  }
}

export function syncConfigToSettings(config?: SyncConfig | null): SyncSettings {
  return {
    enabled: Boolean(config?.enabled),
    s3: {
      endpoint:
        typeof config?.s3?.endpoint === "string" ? config.s3.endpoint : "",
      region: typeof config?.s3?.region === "string" ? config.s3.region : "",
      bucket: typeof config?.s3?.bucket === "string" ? config.s3.bucket : "",
      accessKeyId:
        typeof config?.s3?.accessKeyId === "string"
          ? config.s3.accessKeyId
          : "",
      secretAccessKey:
        typeof config?.s3?.secretAccessKey === "string"
          ? config.s3.secretAccessKey
          : "",
      sessionToken:
        typeof config?.s3?.sessionToken === "string"
          ? config.s3.sessionToken
          : "",
      prefix: typeof config?.s3?.prefix === "string" ? config.s3.prefix : "",
    },
  }
}
