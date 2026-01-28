import { parseAiRequestHeaders } from "@/shared/aiHeaderUtils.js"

export function normalizeBaseUrl(baseUrl: string) {
  return typeof baseUrl === "string" ? baseUrl.replace(/\/+$/, "") : ""
}

export function buildModelsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized ? `${normalized}/models` : ""
}

export function buildChatCompletionsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized ? `${normalized}/chat/completions` : ""
}

export function buildProviderHeaders(
  apiKey: string,
  headers: string,
): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(headers)
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const merged: Record<string, string> = {}

  if (!headerNamesLower.has("content-type")) {
    merged["Content-Type"] = "application/json"
  }

  if (apiKey && !headerNamesLower.has("authorization")) {
    merged.Authorization = `Bearer ${apiKey}`
  }

  return {
    ...merged,
    ...customHeaders,
  }
}

export function extractOpenAICompatibleModels(payload: any): string[] {
  const items = Array.isArray(payload?.data) ? payload.data : []
  return items
    .map((item: any) => item?.id)
    .filter(
      (id: any): id is string => typeof id === "string" && id.trim().length > 0,
    )
}
