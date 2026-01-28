import { composeCapabilities } from "./capability.js"
import type { ChatCompletionClient } from "./types.js"
import { createGoogleGeminiThinkingCapability } from "./capabilities/googleGemini.js"
import { createReasoningNormalizationCapability } from "./capabilities/reasoning.js"
import { createSseStreamingCapability } from "./capabilities/sseStreaming.js"
import { createToolCallingCapability } from "./capabilities/toolCalling.js"
import { OpenAICompatibleJsonClient } from "./openaiCompatible/jsonClient.js"

type ValueOrGetter<T> = T | (() => T)

export interface ProviderTransportOptions {
  endpoint: ValueOrGetter<string>
  buildHeaders: ValueOrGetter<Record<string, string>>
  syncHeaders?: () => Promise<void>
}

export interface ProviderToolingOptions {
  getTools: () => Promise<Array<{ type: "function"; function: any }>>
  executeToolCall: (toolCall: any) => Promise<any>
}

export interface ProviderClients {
  client: ChatCompletionClient
  clientWithTools: ChatCompletionClient
}

export function createOpenAICompatibleClients(
  transport: ProviderTransportOptions,
  tooling?: ProviderToolingOptions,
): ProviderClients {
  const baseClient = new OpenAICompatibleJsonClient({
    endpoint: transport.endpoint,
    buildHeaders: transport.buildHeaders,
    syncHeaders: transport.syncHeaders,
  })

  const client = composeCapabilities(baseClient, [
    createSseStreamingCapability({
      endpoint: transport.endpoint,
      buildHeaders: transport.buildHeaders,
      syncHeaders: transport.syncHeaders,
    }),
    createGoogleGeminiThinkingCapability(),
    createReasoningNormalizationCapability(),
  ])

  const clientWithTools = tooling
    ? composeCapabilities(client, [
        createToolCallingCapability({
          getTools: tooling.getTools,
          executeToolCall: tooling.executeToolCall,
        }),
      ])
    : client

  return { client, clientWithTools }
}

