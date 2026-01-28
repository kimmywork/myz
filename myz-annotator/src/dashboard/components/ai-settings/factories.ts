import type {
  AIModelSetting,
  AIProviderSetting,
  AIProviderType,
  MaxOutputTokenParam,
} from "@/background/settings.js"

function createId(prefix: string) {
  return crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createModelSetting(model = ""): AIModelSetting {
  const maxOutputTokenParam: MaxOutputTokenParam = "max_tokens"
  return {
    id: createId("model"),
    model,
    enabled: true,
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
  }
}

export function createProviderSetting(
  overrides: Partial<AIProviderSetting> = {},
): AIProviderSetting {
  const type: AIProviderType = "openai_compatible"
  return {
    id: createId("provider"),
    name: "OpenAI Compatible",
    type,
    enabled: false,
    baseUrl: "",
    apiKey: "",
    headers: "",
    models: [],
    lastTest: null,
    ...overrides,
  }
}

