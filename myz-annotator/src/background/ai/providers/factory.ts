import { composeCapabilities, type Capability } from "./capability.js"
import type { ChatCompletionClient, ProviderChatCompletionRequest } from "./types.js"
import { createGoogleGeminiThinkingCapability } from "./capabilities/googleGemini.js"
import { createReasoningNormalizationCapability } from "./capabilities/reasoning.js"
import { createSseStreamingCapability } from "./capabilities/sseStreaming.js"
import { createToolCallingCapability } from "./capabilities/toolCalling.js"
import { OpenAICompatibleJsonClient, shouldUseDeveloperRole } from "./openaiCompatible/jsonClient.js"

function mapDeveloperRole(request: ProviderChatCompletionRequest): ProviderChatCompletionRequest {
  if (!shouldUseDeveloperRole(request?.model)) return request
  return {
    ...request,
    messages: request.messages.map((message) =>
      message.role === "system" ? { ...message, role: "developer" } : message,
    ),
  }
}

function createDeveloperRoleCapability() {
  return (client: ChatCompletionClient) => ({
    async createCompletion(request: ProviderChatCompletionRequest, options?: any) {
      return client.createCompletion(mapDeveloperRole(request), options)
    },
  })
}

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

export interface OpenAICompatibleClientOptions {
  extraCapabilities?: Capability[]
  enableStreaming?: boolean
}

export function createOpenAICompatibleClients(
  transport: ProviderTransportOptions,
  tooling?: ProviderToolingOptions,
  options: OpenAICompatibleClientOptions = {},
): ProviderClients {
  const baseClient = new OpenAICompatibleJsonClient({
    endpoint: transport.endpoint,
    buildHeaders: transport.buildHeaders,
    syncHeaders: transport.syncHeaders,
  })

  const baseCapabilities: Capability[] = [
    ...(options.enableStreaming === false
      ? []
      : [
          createSseStreamingCapability({
            endpoint: transport.endpoint,
            buildHeaders: transport.buildHeaders,
            syncHeaders: transport.syncHeaders,
          }),
        ]),
    createGoogleGeminiThinkingCapability(),
    createReasoningNormalizationCapability(),
    createDeveloperRoleCapability(),
    ...(options.extraCapabilities || []),
  ]

  const client = composeCapabilities(baseClient, baseCapabilities)

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
