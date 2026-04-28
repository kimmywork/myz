import type { Capability } from "../capability"
import type { ProviderChatCompletionRequest } from "../types"
import type { ProviderStreamOptions } from "../types"
import { isRecord, toJsonRecord } from "@myz/shared/typeUtils"

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

  if (!options?.enableGeminiThinking && !options?.enableReasoning) {
    return request
  }

  const extraBody = toJsonRecord(request.extra_body, {})
  const google = isRecord(extraBody.google) ? toJsonRecord(extraBody.google) : {}
  const thinkingConfig = isRecord(google.thinking_config)
    ? toJsonRecord(google.thinking_config)
    : {}

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
      return client.createCompletion(
        patchGeminiThinkingConfig(request, options),
        options,
      )
    },
  })
}
