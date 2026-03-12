import {
  normalizeReasoningChunk,
  splitContentAndReasoning,
} from "../../normalize/message"
import type { Capability } from "../capability"
import type { ProviderChatCompletionChoice } from "../types"

function normalizeChoice(choice: ProviderChatCompletionChoice) {
  if (!choice?.message) {
    return choice
  }

  const message = choice.message
  if (!message) {
    return choice
  }
  const contentValue = message.content

  if (typeof contentValue !== "string" && typeof contentValue !== "undefined") {
    const { text, reasoning } = splitContentAndReasoning(contentValue)
    message.content = text
    if (reasoning && !message.reasoning_content) {
      message.reasoning_content = reasoning
    }
  }

  const reasoningCandidates = [
    message.reasoning_content,
    message.reasoning,
    message.analysis,
  ]
  const explicitReasoning =
    reasoningCandidates
      .map((item) => normalizeReasoningChunk(item).trim())
      .find((item) => item) || ""

  if (explicitReasoning && !message.reasoning_content) {
    message.reasoning_content = explicitReasoning
  }

  return choice
}

export function createReasoningNormalizationCapability(): Capability {
  return (client) => ({
    async createCompletion(request, options) {
      const response = await client.createCompletion(request, options)
      if (!Array.isArray(response?.choices)) {
        return response
      }

      return {
        ...response,
        choices: response.choices.map(normalizeChoice),
      }
    },
  })
}
