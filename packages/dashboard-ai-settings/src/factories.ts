import { getProviderTypeMeta } from "./providerCatalog"
import type {
  AIModelSetting,
  AIProviderSetting,
  AIProviderType,
  MaxOutputTokenParam,
} from "./types"

function createId(prefix: string) {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createModelSetting(model = ""): AIModelSetting {
  const maxOutputTokenParam: MaxOutputTokenParam = "max_tokens"
  return {
    id: createId("model"),
    model,
    enabled: true,
    systemPromptInUserMessage: false,
    capabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
    },
    limits: {
      contextWindow: 32768,
      maxOutputTokens: 4096,
      maxOutputTokenParam,
    },
    tooling: {
      toolChoice: { mode: "auto", toolName: "" },
      strict: "auto",
      parallelToolCalls: "auto",
    },
  }
}

export function createProviderSetting(
  overrides: Partial<AIProviderSetting> = {},
): AIProviderSetting {
  const type: AIProviderType =
    overrides.type && typeof overrides.type === "string"
      ? overrides.type
      : "openai_compatible"
  const meta = getProviderTypeMeta(type)
  return {
    id: createId("provider"),
    name: meta.defaultName,
    type,
    enabled: false,
    streamingEnabled: true,
    compatProfile: "auto",
    reasoningMode: "provider_default",
    reasoningEffort: "provider_default",
    baseUrl: meta.defaultBaseUrl,
    apiKey: "",
    headers: "",
    models: [],
    lastTest: null,
    ...overrides,
  }
}
