import { createGoogleGeminiThinkingCapability } from "./capabilities/googleGemini"
import { createOpenAICompatibleProfileCapability } from "./capabilities/openaiCompatibleProfile"
import { createReasoningNormalizationCapability } from "./capabilities/reasoning"
import { createToolCallingCapability } from "./capabilities/toolCalling"
import { composeCapabilities, type Capability } from "./capability"
import {
  OpenAICompatibleJsonClient,
  shouldUseDeveloperRole,
} from "./openaiCompatible/jsonClient"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderStreamOptions,
  ProviderToolCall,
  ProviderToolSpec,
} from "./types"
import type { ToolExecutionResult } from "../types"
import type { AIProviderSetting } from "../settings"

function mapDeveloperRole(
  request: ProviderChatCompletionRequest,
): ProviderChatCompletionRequest {
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
    async createCompletion(
      request: ProviderChatCompletionRequest,
      options?: ProviderStreamOptions,
    ) {
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
  getTools: () => Promise<ProviderToolSpec[]>
  executeToolCall: (toolCall: ProviderToolCall) => Promise<ToolExecutionResult>
}

export interface ProviderClients {
  client: ChatCompletionClient
  clientWithTools: ChatCompletionClient
}

export interface OpenAICompatibleClientOptions {
  provider?: AIProviderSetting
  extraCapabilities?: Capability[]
  enableStreaming?: boolean
  replayAssistantReasoning?: boolean
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
    streamingEnabled: options.enableStreaming !== false,
  })

  const baseCapabilities: Capability[] = [
    createGoogleGeminiThinkingCapability(),
    createReasoningNormalizationCapability(),
    createDeveloperRoleCapability(),
    ...(options.provider
      ? [createOpenAICompatibleProfileCapability(options.provider)]
      : []),
    ...(options.extraCapabilities || []),
  ]

  const client = composeCapabilities(baseClient, baseCapabilities)

  const clientWithTools = tooling
    ? composeCapabilities(client, [
        createToolCallingCapability({
          getTools: tooling.getTools,
          executeToolCall: tooling.executeToolCall,
          preserveAssistantReasoningContent: Boolean(
            options.replayAssistantReasoning,
          ),
        }),
      ])
    : client

  return { client, clientWithTools }
}
