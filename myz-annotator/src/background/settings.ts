import { HIGHLIGHT_STYLES } from "@/shared/types";

export type AIProviderType = "openai_compatible";

export type MaxOutputTokenParam = "max_tokens" | "max_completion_tokens";

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

export interface AIModelSetting {
  id: string;
  model: string;
  enabled: boolean;
  capabilities: AIModelCapabilities;
  limits: AIModelLimits;
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

export type AIToolSelectionMode = "manual" | "auto";

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
   * Optional fallback model for Vision when the primary model lacks it.
   */
  multimodalTarget?: AIAgentModelRef | null;
}

export interface AIAgentsSettings {
  conversation: AIAgentConfig;
  insights: AIAgentConfig;
}

export interface VectorSettings {
  enabled: boolean;
  target: AIAgentModelRef | null;
  lastTest: VectorSearchLastTestStatus | null;
  /**
   * Only show matches whose similarity score >= matchThreshold.
   * Stored as a fraction (0.0 - 1.0). UI exposes 40% - 100%.
   */
  matchThreshold: number;
}

export interface VectorSearchLastTestStatus {
  ok: boolean;
  message: string;
  testedAt: string;
  providerId: string;
  modelId: string;
  model: string;
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
  vectorSearch: VectorSettings;
}

export interface SocialImportProviderSettings {
  profileUrl: string;
}

export interface SocialImportSettings {
  twitter: SocialImportProviderSettings;
  mastodon: SocialImportProviderSettings;
}

export interface Settings extends AIAssistantSettings {
  dashboardView: "cards" | "list";
  colorPalette: string[];
  lastUsedStyle: HIGHLIGHT_STYLES;
  lastUsedColor: string;
  socialImport: SocialImportSettings;
}
