import type { AIAssistantSettings, AIProviderSetting } from "../../settings.js"
import { syncAiRequestHeaderRules } from "../../aiHeaders.js"

export async function syncRequestHeaderRules(
  provider: AIProviderSetting | null,
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
) {
  const providerId =
    provider?.id || settings.aiActiveProviderId || "active-provider"
  const apiEndpoint = provider?.apiEndpoint || settings.aiApiEndpoint || ""
  const requestHeaders = provider?.requestHeaders || settings.aiRequestHeaders || ""

  if (!provider || !apiEndpoint) {
    return
  }

  const payload: AIAssistantSettings = {
    ...(settings as AIAssistantSettings),
    aiActiveProviderId: providerId,
    aiApiEndpoint: apiEndpoint,
    aiRequestHeaders: requestHeaders,
    aiProviders: [
      {
        ...provider,
      },
    ],
  }

  try {
    await syncAiRequestHeaderRules(payload)
  } catch (error) {
    console.warn("Failed to update AI header rules", error)
  }
}

