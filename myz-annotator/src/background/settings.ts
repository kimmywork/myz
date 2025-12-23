import { HIGHLIGHT_STYLES } from "@/shared/types";

export interface AIProviderSetting {
  id: string;
  name: string;
  apiKey: string;
  model: string;
customModel: string;
  contextSize: string;
  lastTestStatus: { ok: boolean; message: string } | null;
  maxTokens: number;
  apiEndpoint: string;
  requestHeaders: string;
}

export interface VectorSettings {
  vectorSearchEnabled: boolean;
  vectorModelReady: boolean;
  vectorUseLocalModel: boolean | "remote";
  vectorOpenAiEndpoint: string;
  vectorOpenAiApiKey: string;
  vectorOpenAiModel: string;
  vectorMaxChars: number;
}

export interface McpServerSetting {
  id: string;
  name: string;
  enabled: boolean;
  url: string;
  headers?: Record<string, string>;
}

export interface AIAssistantSettings {
  // AI Assistant settings
  aiAssistantEnabled: boolean;
  aiApiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiCustomModel: string;
  aiContextSize: string;
  aiMaxTokens: number;
  aiRequestHeaders: string;
  aiProviders: Array<AIProviderSetting>;
  aiActiveProviderId: string | null;
  aiMcpServers: McpServerSetting[];
}

export interface InternetArchiveSettings {
  internetArchiveEnabled: boolean;
  internetArchiveAccessKey: string;
  internetArchiveAccessSecret: string;
}

export interface Settings
  extends VectorSettings,
    AIAssistantSettings,
    InternetArchiveSettings {
  dashboardView: "cards" | "list";
  lastUsedStyle: HIGHLIGHT_STYLES;
  lastUsedColor: string;
}
