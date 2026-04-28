import { splitGeminiThoughtTaggedContent } from "../vendors/googleGemini"
import { isRecord } from "@myz/shared/typeUtils"

const REASONING_TYPES = new Set([
  "reasoning",
  "reasoning_content",
  "analysis",
  "think",
  "thinking",
  "thought",
])

interface SplittedContent {
  text: string
  reasoning: string
}

export function splitContentAndReasoning(content: unknown): SplittedContent {
  const result = { text: "", reasoning: "" }
  if (typeof content === "undefined" || content === null) {
    return result
  }

  const append = (value: string | number, target: "text" | "reasoning") => {
    if (typeof value === "undefined" || value === null) return
    result[target] += String(value)
  }

  const handlePart = (part: unknown) => {
    if (typeof part === "undefined" || part === null) return
    if (typeof part === "string" || typeof part === "number") {
      append(part, "text")
      return
    }

    if (Array.isArray(part)) {
      part.forEach(handlePart)
      return
    }

    if (!isRecord(part)) {
      return
    }

    const type = typeof part.type === "string" ? part.type.toLowerCase() : ""
    const textValue =
      typeof part.text === "string"
        ? part.text
        : typeof part.content === "string"
          ? part.content
          : ""
    const thinkingValue = Array.isArray(part.thinking) ? part.thinking : []
    const explicitReasoningText =
      typeof part.reasoning === "string"
        ? part.reasoning
        : typeof part.thought === "string"
          ? part.thought
          : ""
    const isReasoning =
      REASONING_TYPES.has(type) ||
      part.reasoning === true ||
      Boolean(part.thought) ||
      Boolean(explicitReasoningText)

    if (isReasoning && Array.isArray(thinkingValue) && thinkingValue.length) {
      const nested = splitContentAndReasoning(thinkingValue)
      if (nested.reasoning || nested.text) {
        append(nested.reasoning || nested.text, "reasoning")
      }
    } else if (isReasoning && (textValue || explicitReasoningText)) {
      append(explicitReasoningText || textValue, "reasoning")
    } else if (textValue) {
      append(textValue, "text")
    }
  }

  handlePart(content)
  return result
}

export function normalizeReasoningChunk(value: unknown) {
  if (typeof value === "undefined" || value === null) return ""
  const { text, reasoning } = splitContentAndReasoning(value)
  return (reasoning || text || "").toString()
}

export function normalizeMessagePayload(message: unknown): {
  content: string
  reasoning: string
} {
  if (!isRecord(message)) {
    return { content: "", reasoning: "" }
  }

  const extraContent = isRecord(message.extra_content)
    ? message.extra_content
    : null
  const googleMeta = extraContent && isRecord(extraContent.google)
    ? extraContent.google
    : null
  const googleThoughtFlag = Boolean(googleMeta?.thought)
  const contentValue = message.content
  const isStringContent = typeof contentValue === "string"
  const tagged =
    isStringContent && (contentValue.includes("<thought>") || googleThoughtFlag)
      ? splitGeminiThoughtTaggedContent(contentValue)
      : { text: "", thought: "" }

  const treatAsThoughtOnly =
    googleThoughtFlag && isStringContent && !tagged.thought
  const visibleText = treatAsThoughtOnly ? "" : tagged.text

  const { text, reasoning } = splitContentAndReasoning(
    isStringContent ? visibleText : contentValue,
  )
  const extractedThought =
    tagged.thought || (treatAsThoughtOnly ? contentValue : "")
  const reasoningCandidates = [
    extractedThought,
    message.reasoning_content,
    message.reasoning,
    message.analysis,
  ]
  const explicitReasoning =
    reasoningCandidates
      .map((item) => normalizeReasoningChunk(item).trim())
      .find((item) => item) || ""

  return {
    content:
      text ||
      (typeof message.content === "string"
        ? tagged.thought
          ? tagged.text
          : treatAsThoughtOnly
            ? ""
            : tagged.text || message.content
        : normalizeReasoningChunk(message.content)),
    reasoning: explicitReasoning || reasoning || "",
  }
}
