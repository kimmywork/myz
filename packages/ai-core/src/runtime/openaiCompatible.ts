import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import { isRecord } from "@myz/shared/typeUtils"
import type {
  AIProviderSetting,
  OpenAICompatibleProfile,
} from "../settings"

const REPLAY_REASONING_COMPAT_PROFILES = new Set<OpenAICompatibleProfile>([
  "deepseek",
  "moonshot",
  "glm",
])

const HOST_PROFILE_MATCHERS: Array<{
  profile: OpenAICompatibleProfile
  matches: (hostname: string) => boolean
}> = [
  {
    profile: "deepseek",
    matches: (hostname) => hostname.includes("deepseek.com"),
  },
  {
    profile: "moonshot",
    matches: (hostname) =>
      hostname.includes("moonshot") || hostname.includes("kimi.com"),
  },
  {
    profile: "glm",
    matches: (hostname) =>
      hostname.includes("bigmodel") || hostname === "z.ai" || hostname.endsWith(".z.ai"),
  },
  {
    profile: "qwen",
    matches: (hostname) =>
      hostname.includes("dashscope") || hostname.includes("aliyuncs.com"),
  },
  {
    profile: "minimax",
    matches: (hostname) =>
      hostname.includes("minimax.io") || hostname.includes("minimax.chat"),
  },
  {
    profile: "longcat",
    matches: (hostname) => hostname.includes("longcat.chat"),
  },
  {
    profile: "mimo",
    matches: (hostname) =>
      hostname.includes("xiaomimimo.com") || hostname.includes("mimo.mi.com"),
  },
]

export function normalizeBaseUrl(baseUrl: string) {
  return typeof baseUrl === "string" ? baseUrl.replace(/\/+$/, "") : ""
}

export function isOfficialOpenAIApiBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return false
  try {
    const url = new URL(normalized)
    return url.hostname === "api.openai.com"
  } catch {
    return false
  }
}

export function buildModelsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized ? `${normalized}/models` : ""
}

export function buildChatCompletionsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized ? `${normalized}/chat/completions` : ""
}

function inferOpenAICompatibleProfileFromBaseUrl(
  baseUrl: string,
): OpenAICompatibleProfile {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized || isOfficialOpenAIApiBaseUrl(normalized)) {
    return "custom"
  }

  try {
    const hostname = new URL(normalized).hostname.toLowerCase()
    const matched = HOST_PROFILE_MATCHERS.find((entry) => entry.matches(hostname))
    return matched?.profile || "custom"
  } catch {
    return "custom"
  }
}

export function resolveOpenAICompatibleProfile(provider: {
  type?: unknown
  baseUrl?: unknown
  compatProfile?: unknown
}) {
  if (provider?.type !== "openai_compatible") {
    return "custom" as OpenAICompatibleProfile
  }

  const compatProfile =
    typeof provider?.compatProfile === "string" ? provider.compatProfile : "auto"
  if (compatProfile && compatProfile !== "auto") {
    return compatProfile as OpenAICompatibleProfile
  }

  const baseUrl =
    typeof provider?.baseUrl === "string" ? provider.baseUrl : ""
  return inferOpenAICompatibleProfileFromBaseUrl(baseUrl)
}

export function shouldReplayOpenAICompatibleReasoning(provider: {
  type?: unknown
  baseUrl?: unknown
  compatProfile?: unknown
}) {
  if (provider?.type !== "openai_compatible") {
    return false
  }

  const profile = resolveOpenAICompatibleProfile(provider)
  if (REPLAY_REASONING_COMPAT_PROFILES.has(profile)) {
    return true
  }

  const compatProfile =
    typeof provider?.compatProfile === "string" ? provider.compatProfile : "auto"
  if (compatProfile === "auto") {
    const baseUrl =
      typeof provider?.baseUrl === "string" ? provider.baseUrl : ""
    return Boolean(baseUrl) && !isOfficialOpenAIApiBaseUrl(baseUrl)
  }

  return false
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

export function extractOpenAICompatibleModels(payload: unknown): string[] {
  const items =
    isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
  return items
    .map((item) =>
      isRecord(item) && typeof item.id === "string" ? item.id : "",
    )
    .filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    )
}

export function getProviderReasoningMode(
  provider: Pick<AIProviderSetting, "reasoningMode">,
  enableReasoning: boolean,
) {
  if (provider.reasoningMode === "enabled") return "enabled" as const
  if (provider.reasoningMode === "disabled") return "disabled" as const
  return enableReasoning ? ("enabled" as const) : ("provider_default" as const)
}

export function getProviderReasoningEffort(
  provider: Pick<AIProviderSetting, "reasoningEffort">,
  requestReasoningEffort?: unknown,
) {
  if (
    requestReasoningEffort === "low" ||
    requestReasoningEffort === "medium" ||
    requestReasoningEffort === "high"
  ) {
    return requestReasoningEffort
  }
  if (
    provider.reasoningEffort === "low" ||
    provider.reasoningEffort === "medium" ||
    provider.reasoningEffort === "high"
  ) {
    return provider.reasoningEffort
  }
  return undefined
}
