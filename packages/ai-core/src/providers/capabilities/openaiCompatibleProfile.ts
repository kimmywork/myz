import {
  getProviderReasoningEffort,
  getProviderReasoningMode,
  resolveOpenAICompatibleProfile,
} from "../../runtime/openaiCompatible"
import type { AIProviderSetting } from "../../settings"
import type { Capability } from "../capability"
import type { ProviderChatCompletionRequest, ProviderStreamOptions } from "../types"
import { isRecord, toJsonRecord } from "@myz/shared/typeUtils"

function patchThinkingType(
  extraBody: Record<string, unknown>,
  reasoningMode: "enabled" | "disabled",
) {
  const thinking = isRecord(extraBody.thinking)
    ? toJsonRecord(extraBody.thinking)
    : {}
  return {
    ...extraBody,
    thinking: {
      ...thinking,
      type: reasoningMode,
    },
  }
}

function patchOpenAICompatibleRequest(
  provider: AIProviderSetting,
  request: ProviderChatCompletionRequest,
  options?: ProviderStreamOptions,
) {
  const profile = resolveOpenAICompatibleProfile(provider)
  const reasoningMode = getProviderReasoningMode(
    provider,
    Boolean(options?.enableReasoning),
  )
  const reasoningEffort = getProviderReasoningEffort(
    provider,
    request.reasoning_effort,
  )
  const extraBody = toJsonRecord(request.extra_body, {})

  let nextRequest: ProviderChatCompletionRequest = {
    ...request,
  }
  let nextExtraBody = extraBody
  let extraBodyChanged = false

  switch (profile) {
    case "deepseek":
    case "moonshot":
    case "glm": {
      if (reasoningMode === "enabled" || reasoningMode === "disabled") {
        nextExtraBody = patchThinkingType(nextExtraBody, reasoningMode)
        extraBodyChanged = true
      }
      break
    }
    case "qwen": {
      if (reasoningMode === "enabled" || reasoningMode === "disabled") {
        nextExtraBody = {
          ...nextExtraBody,
          enable_thinking: reasoningMode === "enabled",
        }
        extraBodyChanged = true
      }
      if (
        typeof provider.reasoningBudget === "number" &&
        Number.isFinite(provider.reasoningBudget)
      ) {
        nextExtraBody = {
          ...nextExtraBody,
          thinking_budget: Math.max(0, Math.floor(provider.reasoningBudget)),
        }
        extraBodyChanged = true
      }
      break
    }
    default: {
      break
    }
  }

  if (reasoningMode === "disabled") {
    delete nextRequest.reasoning_effort
  } else if (reasoningEffort) {
    nextRequest.reasoning_effort =
      profile === "deepseek" && reasoningEffort !== "high"
        ? "high"
        : reasoningEffort
  }

  if (extraBodyChanged) {
    nextRequest.extra_body = nextExtraBody
  }

  return nextRequest
}

export function createOpenAICompatibleProfileCapability(
  provider: AIProviderSetting,
): Capability {
  return (client) => ({
    async createCompletion(request, options) {
      return client.createCompletion(
        patchOpenAICompatibleRequest(provider, request, options),
        options,
      )
    },
  })
}
