import type { ProviderType, CompatProfile } from "../settings"
import type { LLMClient } from "../providers/types"
import { createOpenAICompatibleClient } from "../providers/openaiCompatible"
import { createOpenAIResponsesClient } from "../providers/openaiResponses"
import { createAnthropicClient } from "../providers/anthropic"
import { createGeminiClient } from "../providers/gemini"
import { createMistralClient } from "../providers/mistral"

export interface ProviderConfig {
  type: ProviderType
  baseUrl: string
  apiKey: string
  profile?: CompatProfile
  stream?: boolean
}

export function createLLMClient(config: ProviderConfig): LLMClient {
  switch (config.type) {
    case "openai_compatible":
      return createOpenAICompatibleClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        profile: config.profile,
        stream: config.stream,
      })
    case "openai_responses":
      return createOpenAIResponsesClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        stream: config.stream,
      })
    case "anthropic":
      return createAnthropicClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        stream: config.stream,
      })
    case "gemini":
      return createGeminiClient({
        apiKey: config.apiKey,
        stream: config.stream,
      })
    case "mistral":
      return createMistralClient({
        apiKey: config.apiKey,
        stream: config.stream,
      })
    default:
      return createOpenAICompatibleClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        stream: config.stream,
      })
  }
}
