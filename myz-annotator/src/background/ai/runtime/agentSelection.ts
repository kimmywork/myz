import type {
  AIAssistantSettings,
  AIModelSetting,
  AIProviderSetting,
  AIAgentModelRef,
  AIAgentConfig,
} from "../../settings.js"

export type AgentName = "conversation" | "insights" | "autoHighlight"

export interface ResolvedAgentTarget {
  provider: AIProviderSetting
  model: AIModelSetting
  temperature: number
  compressImages: boolean
}

function findProvider(settings: AIAssistantSettings, providerId: string) {
  return (settings.aiProviders || []).find((p) => p.id === providerId) || null
}

function findModel(provider: AIProviderSetting, modelId: string) {
  return (provider.models || []).find((m) => m.id === modelId) || null
}

export function resolveModelRef(
  settings: AIAssistantSettings,
  target: AIAgentModelRef,
): { provider: AIProviderSetting; model: AIModelSetting } {
  if (!target?.providerId || !target.modelId) {
    throw new Error("Target model is not configured")
  }

  const provider = findProvider(settings, target.providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${target.providerId}`)
  }
  if (!provider.enabled || !provider.lastTest?.ok) {
    throw new Error(`Provider is not enabled or not tested: ${provider.name}`)
  }

  const model = findModel(provider, target.modelId)
  if (!model) {
    throw new Error(`Model not found in provider: ${provider.name}`)
  }
  if (!model.enabled) {
    throw new Error(`Model is not enabled: ${provider.name} (${model.model})`)
  }

  return { provider, model }
}

export function resolveAgentTarget(
  settings: AIAssistantSettings,
  agent: AgentName,
): ResolvedAgentTarget {
  const agentConfig: AIAgentConfig | undefined = (settings.aiAgents as any)?.[agent]
  const target: AIAgentModelRef | null | undefined = agentConfig?.target
  if (!target?.providerId || !target.modelId) {
    throw new Error(`Agent ${agent} is not configured`)
  }

  const provider = findProvider(settings, target.providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${target.providerId}`)
  }
  if (!provider.enabled || !provider.lastTest?.ok) {
    throw new Error(`Provider is not enabled or not tested: ${provider.name}`)
  }

  const model = findModel(provider, target.modelId)
  if (!model) {
    throw new Error(`Model not found in provider: ${provider.name}`)
  }
  if (!model.enabled) {
    throw new Error(`Model is not enabled: ${provider.name} (${model.model})`)
  }

  const temperature =
    typeof agentConfig?.temperature === "number" ? agentConfig.temperature : 0.7

  const compressImages =
    agent === "conversation"
      ? Boolean(agentConfig?.compressImages)
      : false

  return { provider, model, temperature, compressImages }
}

export function resolveConversationMultimodalTarget(
  settings: AIAssistantSettings,
): ResolvedAgentTarget | null {
  const agentConfig: AIAgentConfig | undefined = (settings.aiAgents as any)?.conversation
  const target: AIAgentModelRef | null | undefined = (agentConfig as any)?.multimodalTarget
  if (!target?.providerId || !target.modelId) {
    return null
  }
  const { provider, model } = resolveModelRef(settings, target)
  if (!model.capabilities?.vision) {
    throw new Error(`Multimodal model does not support Vision: ${provider.name} (${model.model})`)
  }
  const temperature =
    typeof agentConfig?.temperature === "number" ? agentConfig.temperature : 0.7
  const compressImages = Boolean(agentConfig?.compressImages)
  return { provider, model, temperature, compressImages }
}
