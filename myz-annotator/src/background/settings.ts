import { AUTO_HIGHLIGHT_CATEGORIES, HIGHLIGHT_STYLES } from "@/shared/types";
import { type SettingsSchemaVersion } from "@/shared/versioning";

export const AI_PROVIDER_TYPES = [
  "openai_compatible",
  "openai_responses",
  "gemini",
  "anthropic",
  "mistral",
] as const;

export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number];

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
] as const;

export type OpenAICompatibleProfile =
  (typeof OPENAI_COMPATIBLE_PROFILES)[number];

export const AI_REASONING_MODES = [
  "provider_default",
  "enabled",
  "disabled",
] as const;

export type AIReasoningMode = (typeof AI_REASONING_MODES)[number];

export const AI_REASONING_EFFORT_SETTINGS = [
  "provider_default",
  "low",
  "medium",
  "high",
] as const;

export type AIReasoningEffortSetting =
  (typeof AI_REASONING_EFFORT_SETTINGS)[number];

export const MAX_OUTPUT_TOKEN_PARAMS = [
  "max_tokens",
  "max_completion_tokens",
] as const;
export type MaxOutputTokenParam = (typeof MAX_OUTPUT_TOKEN_PARAMS)[number];

export const AI_TOOL_CHOICE_MODES = [
  "auto",
  "none",
  "required",
  "tool",
] as const;
export type AIToolChoiceMode = (typeof AI_TOOL_CHOICE_MODES)[number];

export const AI_TOOL_FLAG_SETTINGS = ["auto", "on", "off"] as const;
export type AIToolFlagSetting = (typeof AI_TOOL_FLAG_SETTINGS)[number];

export const AI_TOOL_SELECTION_MODES = ["manual", "auto"] as const;
export type AIToolSelectionMode = (typeof AI_TOOL_SELECTION_MODES)[number];

export interface AIModelCapabilities {
  vision: boolean;
  imageOutput: boolean;
  toolCalling: boolean;
  reasoning: boolean;
}

export interface AIModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
  maxOutputTokenParam: MaxOutputTokenParam;
}

export interface AIToolChoiceSetting {
  mode: AIToolChoiceMode;
  toolName?: string;
}

export interface AIToolControlSettings {
  toolChoice: AIToolChoiceSetting;
  strict: AIToolFlagSetting;
  parallelToolCalls: AIToolFlagSetting;
}

export interface AIModelSetting {
  id: string;
  model: string;
  enabled: boolean;
  capabilities: AIModelCapabilities;
  limits: AIModelLimits;
  tooling: AIToolControlSettings;
  systemPromptInUserMessage?: boolean;
}

export interface AIProviderLastTestStatus {
  ok: boolean;
  message: string;
  testedAt: string;
  model: string;
}

export interface AIProviderSetting {
  id: string;
  name: string;
  type: AIProviderType;
  enabled: boolean;
  streamingEnabled?: boolean;
  compatProfile?: OpenAICompatibleProfile;
  reasoningMode?: AIReasoningMode;
  reasoningEffort?: AIReasoningEffortSetting;
  reasoningBudget?: number;
  baseUrl: string;
  apiKey: string;
  headers: string;
  models: AIModelSetting[];
  lastTest: AIProviderLastTestStatus | null;
}

export interface AIAgentModelRef {
  providerId: string;
  modelId: string;
}

export interface AILocalToolsSettings {
  /**
   * Allowlist of local tool names. Tools not listed here are never exposed to models.
   */
  enabledToolNames: string[];
  /**
   * Manual: always expose all allowed tools.
   * Auto: per-message tool selection via a dedicated selector model.
   */
  mode: AIToolSelectionMode;
  /**
   * Provider+model used for tool selection when `mode === "auto"`.
   */
  autoSelectorTarget: AIAgentModelRef | null;
}

export interface AISkillsSettings {
  /**
   * Manual: only explicit @skill will be injected.
   * Auto: per-message skill selection via a dedicated selector model.
   */
  mode: AIToolSelectionMode;
  /**
   * Provider+model used for skill selection when `mode === "auto"`.
   */
  autoSelectorTarget: AIAgentModelRef | null;
}

export interface AIAgentConfig {
  target: AIAgentModelRef | null;
  temperature: number;
  compressImages?: boolean;
  /**
   * Enable Superpower Mode for advanced tools and agent workflow.
   * Only applicable to Conversation agent.
   */
  superpowerMode?: boolean;
  maxHighlights?: number;
  /**
   * Optional fallback model for Vision when the primary model lacks it.
   */
  multimodalTarget?: AIAgentModelRef | null;
  /**
   * Trigger context compaction when the estimated usage reaches this percentage.
   */
  contextCompressionThreshold?: number;
}

export type AutoHighlightCategory = `${AUTO_HIGHLIGHT_CATEGORIES}`;

export interface AutoHighlightCategoryStyle {
  style: HIGHLIGHT_STYLES;
  color: string;
}

export type AutoHighlightCategoryStyles = Record<
  AutoHighlightCategory,
  AutoHighlightCategoryStyle
>;

export interface AutoHighlightAgentConfig extends AIAgentConfig {
  categoryStyles?: AutoHighlightCategoryStyles;
}

export interface AIAgentsSettings {
  conversation: AIAgentConfig;
  insights: AIAgentConfig;
  autoHighlight: AutoHighlightAgentConfig;
}

export interface McpServerSetting {
  id: string;
  name: string;
  enabled: boolean;
  url: string;
  headers?: Record<string, string>;
  lastTest?: {
    ok: boolean;
    message: string;
    testedAt: string;
  } | null;
}

export interface AIAssistantSettings {
  // AI Assistant settings
  aiAssistantEnabled: boolean;
  aiProviders: Array<AIProviderSetting>;
  aiAgents: AIAgentsSettings;
  aiMcpServers: McpServerSetting[];
  aiLocalTools: AILocalToolsSettings;
  aiSkills: AISkillsSettings;
}

export interface SocialImportProviderSettings {
  profileUrl: string;
}

export interface SocialImportSettings {
  twitter: SocialImportProviderSettings;
  mastodon: SocialImportProviderSettings;
}

export interface SyncS3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  prefix?: string;
}

export interface SyncSettings {
  enabled: boolean;
  s3: SyncS3Settings;
}

export interface Settings extends AIAssistantSettings {
  dashboardView: "cards" | "list";
  colorPalette: string[];
  lastUsedStyle: HIGHLIGHT_STYLES;
  lastUsedColor: string;
  socialImport: SocialImportSettings;
  sync: SyncSettings;
}

export interface SettingsBundle {
  schemaVersion: SettingsSchemaVersion;
  data: Settings;
}
