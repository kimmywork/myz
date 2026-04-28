import type { TokenUsage } from "./types"

function isUsageRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function readUsageNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

export function normalizeTokenUsage(usage: unknown): TokenUsage | undefined {
  if (!isUsageRecord(usage)) return undefined

  const record = usage as Record<string, unknown>
  const inputDetails = isUsageRecord(record.input_tokens_details)
    ? record.input_tokens_details
    : undefined
  const outputDetails = isUsageRecord(record.output_tokens_details)
    ? record.output_tokens_details
    : undefined

  const promptTokens = readUsageNumber(record, [
    "prompt_tokens",
    "promptTokens",
    "input_tokens",
    "inputTokens",
    "promptTokenCount",
  ])
  const completionTokens = readUsageNumber(record, [
    "completion_tokens",
    "completionTokens",
    "output_tokens",
    "outputTokens",
    "candidatesTokenCount",
  ])
  const totalTokens =
    readUsageNumber(record, [
      "total_tokens",
      "totalTokens",
      "totalTokenCount",
    ]) ??
    (typeof promptTokens === "number" && typeof completionTokens === "number"
      ? promptTokens + completionTokens
      : undefined)
  const reasoningTokens =
    readUsageNumber(record, [
      "reasoning_tokens",
      "reasoningTokens",
      "thoughtsTokenCount",
    ]) ??
    (outputDetails
      ? readUsageNumber(outputDetails, ["reasoning_tokens", "reasoningTokens"])
      : undefined)
  const cachedPromptTokens =
    readUsageNumber(record, [
      "cached_prompt_tokens",
      "cachedPromptTokens",
      "cachedContentTokenCount",
      "cache_read_input_tokens",
    ]) ??
    (inputDetails
      ? readUsageNumber(inputDetails, ["cached_tokens", "cachedTokens"])
      : undefined)

  return {
    ...record,
    ...(totalTokens != null
      ? {
          total_tokens: totalTokens,
          totalTokens,
        }
      : {}),
    ...(promptTokens != null
      ? {
          prompt_tokens: promptTokens,
          promptTokens,
          input_tokens: promptTokens,
          inputTokens: promptTokens,
        }
      : {}),
    ...(completionTokens != null
      ? {
          completion_tokens: completionTokens,
          completionTokens,
          output_tokens: completionTokens,
          outputTokens: completionTokens,
        }
      : {}),
    ...(reasoningTokens != null
      ? {
          reasoning_tokens: reasoningTokens,
          reasoningTokens: reasoningTokens,
        }
      : {}),
    ...(cachedPromptTokens != null
      ? {
          cached_prompt_tokens: cachedPromptTokens,
          cachedPromptTokens: cachedPromptTokens,
        }
      : {}),
  }
}
