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

export interface AIAgentConfig {
  target: AIAgentModelRef | null;
  temperature: number;
}

export interface AIAgentsSettings {
  conversation: AIAgentConfig;
  insights: AIAgentConfig;
}

export interface VectorSettings {
  enabled: boolean;
  target: AIAgentModelRef | null;
  lastTest: VectorSearchLastTestStatus | null;
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
