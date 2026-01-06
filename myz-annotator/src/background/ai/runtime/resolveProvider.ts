import type { AIAssistantSettings, AIProviderSetting } from "../../settings.js"

export function resolveActiveProvider(
  settings: Partial<AIAssistantSettings> = {},
  options: { allowUntested?: boolean } = {},
): {
  provider: AIProviderSetting | null
  fallbackSettings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>
} {
  const allowUntested = Boolean(options.allowUntested)
  const providers = Array.isArray(settings.aiProviders) ? settings.aiProviders : []
  const eligibleProviders = providers.filter((p) => p && typeof p === "object")
  const hasProviders = eligibleProviders.length > 0
  let provider: AIProviderSetting | null = null

  if (allowUntested) {
    provider =
      eligibleProviders.find((p) => p.id === settings.aiActiveProviderId) ||
      eligibleProviders[0] ||
      null
  } else {
    provider =
      eligibleProviders.find(
        (p) => p.id === settings.aiActiveProviderId && p.lastTestStatus?.ok,
      ) || null
    if (!provider && eligibleProviders.length) {
      provider = eligibleProviders.find((p) => p.lastTestStatus?.ok) || null
    }
  }

  if (
    !provider &&
    !hasProviders &&
    (settings.aiApiEndpoint || settings.aiApiKey || settings.aiModel)
  ) {
    provider = {
      id: "provider-default",
      name: "默认 Provider",
      apiEndpoint: settings.aiApiEndpoint!,
      apiKey: settings.aiApiKey!,
      model: settings.aiModel || "gpt-4",
      customModel: settings.aiCustomModel || "",
      contextSize: settings.aiContextSize || "32K",
      maxTokens:
        typeof settings.aiMaxTokens === "number" ? settings.aiMaxTokens : 32768,
      requestHeaders: settings.aiRequestHeaders || "",
      lastTestStatus: { ok: true, message: "legacy" },
    }
  }

  const fallbackSettings: Partial<AIAssistantSettings> &
    Partial<AIProviderSetting> = {
    ...settings,
  }
  if (provider) {
    fallbackSettings.aiActiveProviderId =
      settings.aiActiveProviderId || provider.id
    fallbackSettings.aiApiEndpoint = provider.apiEndpoint || ""
    fallbackSettings.aiApiKey = provider.apiKey || ""
    fallbackSettings.aiModel = provider.model || "gpt-4"
    fallbackSettings.aiCustomModel = provider.customModel || ""
    fallbackSettings.aiContextSize = provider.contextSize || "32K"
    fallbackSettings.aiMaxTokens =
      typeof provider.maxTokens === "number" ? provider.maxTokens : 32768
    fallbackSettings.aiRequestHeaders = provider.requestHeaders || ""
    fallbackSettings.apiEndpoint = provider.apiEndpoint || ""
    fallbackSettings.apiKey = provider.apiKey || ""
    fallbackSettings.model = provider.model || "gpt-4"
    fallbackSettings.customModel = provider.customModel || ""
    fallbackSettings.contextSize = provider.contextSize || "32K"
    fallbackSettings.maxTokens =
      typeof provider.maxTokens === "number" ? provider.maxTokens : 32768
    fallbackSettings.requestHeaders = provider.requestHeaders || ""
  }

  return { provider, fallbackSettings }
}

