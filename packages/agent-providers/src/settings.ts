export const PROVIDER_TYPES = [
  "openai_compatible",
  "openai_responses",
  "gemini",
  "anthropic",
  "mistral",
] as const

export type ProviderType = (typeof PROVIDER_TYPES)[number]

export const COMPAT_PROFILES = [
  "auto", "deepseek", "moonshot", "glm", "qwen", "minimax", "longcat", "mimo", "custom",
] as const

export type CompatProfile = (typeof COMPAT_PROFILES)[number]

export function resolveProfile(baseUrl: string, explicit?: CompatProfile): CompatProfile {
  if (explicit && explicit !== "auto") return explicit
  try {
    const h = new URL(baseUrl).hostname.toLowerCase()
    if (h.includes("deepseek.com")) return "deepseek"
    if (h.includes("moonshot") || h.includes("kimi.com")) return "moonshot"
    if (h.includes("bigmodel") || h.endsWith(".z.ai")) return "glm"
    if (h.includes("dashscope") || h.includes("aliyuncs.com")) return "qwen"
    if (h.includes("minimax.io") || h.includes("minimax.chat")) return "minimax"
    if (h.includes("longcat.chat")) return "longcat"
    if (h.includes("xiaomimimo.com") || h.includes("mimo.mi.com")) return "mimo"
  } catch {}
  return "custom"
}
