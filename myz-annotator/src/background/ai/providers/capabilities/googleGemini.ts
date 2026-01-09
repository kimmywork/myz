import type { Capability } from "../capability.js"
import type { ProviderChatCompletionRequest } from "../types.js"
import type { ProviderStreamOptions } from "../types.js"

function isGeminiModel(model: unknown) {
  return typeof model === "string" && /^gemini/i.test(model)
}

function patchGeminiThinkingConfig(
  request: ProviderChatCompletionRequest,
  options?: ProviderStreamOptions,
) {
  if (!isGeminiModel(request.model)) {
    return request
  }

  if (!options?.enableGeminiThinking) {
    return request
  }

  const extraBody = request.extra_body || {}
  const google = extraBody.google || {}
  const thinkingConfig = google.thinking_config || {}

  if (typeof thinkingConfig.include_thoughts !== "undefined") {
    return request
  }

  return {
    ...request,
    extra_body: {
      ...extraBody,
      google: {
        ...google,
        thinking_config: {
          ...thinkingConfig,
          include_thoughts: true,
        },
      },
    },
  }
}

export function createGoogleGeminiThinkingCapability(): Capability {
  return (client) => ({
    async createCompletion(request, options) {
      return client.createCompletion(patchGeminiThinkingConfig(request, options), options)
    },
  })
}
