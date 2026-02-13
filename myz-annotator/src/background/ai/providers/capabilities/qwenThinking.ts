import type { Capability } from "../capability.js"
import type { ProviderChatCompletionRequest } from "../types.js"

function patchQwenThinking(
  request: ProviderChatCompletionRequest,
  enableThinking?: boolean,
): ProviderChatCompletionRequest {
  if (typeof enableThinking !== "boolean") {
    return request
  }

  const extraBody = request.extra_body || {}
  if (typeof extraBody.enable_thinking !== "undefined") {
    return request
  }

  return {
    ...request,
    extra_body: {
      ...extraBody,
      enable_thinking: enableThinking,
    },
  }
}

export function createQwenThinkingCapability(): Capability {
  return (client) => ({
    async createCompletion(request, options) {
      return client.createCompletion(
        patchQwenThinking(request, options?.enableGeminiThinking),
        options,
      )
    },
  })
}

