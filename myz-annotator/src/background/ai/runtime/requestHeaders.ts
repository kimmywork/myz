import type { AIAssistantSettings, AIProviderSetting } from "../../settings.js"
import { parseAiRequestHeaders } from "@/shared/aiHeaderUtils.js"

export function getApiEndpoint(
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
) {
  return settings.apiEndpoint || settings.aiApiEndpoint || ""
}

export function getApiKey(
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
) {
  return settings.apiKey || settings.aiApiKey || ""
}

export function getRequestHeadersString(
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
) {
  return settings.requestHeaders || settings.aiRequestHeaders || ""
}

export function buildRequestHeaders(
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(getRequestHeadersString(settings))
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const headers: Record<string, string> = {}

  if (!headerNamesLower.has("content-type")) {
    headers["Content-Type"] = "application/json"
  }

  const apiKey = getApiKey(settings)
  if (apiKey && !headerNamesLower.has("authorization")) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return {
    ...headers,
    ...customHeaders,
  }
}

