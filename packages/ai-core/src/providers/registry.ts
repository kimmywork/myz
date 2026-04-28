import type { AIProviderSetting, MaxOutputTokenParam } from "../settings"
import {
  buildChatCompletionsUrl,
  buildModelsUrl,
  buildProviderHeaders,
  extractOpenAICompatibleModels,
  shouldReplayOpenAICompatibleReasoning,
} from "../runtime/openaiCompatible"
import {
  AnthropicJsonClient,
  buildAnthropicHeaders,
  buildAnthropicModelsUrl,
  extractAnthropicModels,
} from "./anthropic/jsonClient"
import { createGoogleGeminiThinkingCapability } from "./capabilities/googleGemini"
import { createReasoningNormalizationCapability } from "./capabilities/reasoning"
import { createToolCallingCapability } from "./capabilities/toolCalling"
import { composeCapabilities } from "./capability"
import type { ProviderToolingOptions, ProviderClients } from "./factory"
import type { ProviderChatCompletionRequest } from "./types"
import { createOpenAICompatibleClients } from "./factory"
import {
  GeminiJsonClient,
  createGeminiSdkClient,
  extractGeminiModels,
} from "./gemini/jsonClient"
import {
  MistralJsonClient,
  buildMistralHeaders,
  buildMistralSdkBaseUrl,
  createMistralSdkClient,
  extractMistralModels,
} from "./mistral/jsonClient"
import { OpenAIResponsesJsonClient } from "./openaiResponses/jsonClient"
import { isRecord } from "@myz/shared/typeUtils"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

export function createProviderClients(
  provider: AIProviderSetting,
  tooling?: ProviderToolingOptions,
): ProviderClients {
  switch (provider.type) {
    case "openai_compatible": {
      const endpoint = buildChatCompletionsUrl(provider.baseUrl)
      const headers = buildProviderHeaders(provider.apiKey, provider.headers)
      return createOpenAICompatibleClients(
        {
          endpoint: () => endpoint,
          buildHeaders: () => headers,
        },
        tooling,
        {
          provider,
          enableStreaming: provider.streamingEnabled !== false,
          replayAssistantReasoning:
            shouldReplayOpenAICompatibleReasoning(provider),
        },
      )
    }
    case "openai_responses": {
      const baseClient = new OpenAIResponsesJsonClient({
        baseUrl: () => provider.baseUrl,
        apiKey: () => provider.apiKey,
        headers: () => provider.headers,
      })
      const client = composeCapabilities(baseClient, [
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
    case "gemini": {
      const baseClient = new GeminiJsonClient({
        baseUrl: () => provider.baseUrl,
        apiKey: () => provider.apiKey,
        headers: () => provider.headers,
      })
      const client = composeCapabilities(baseClient, [
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
    case "anthropic": {
      const baseClient = new AnthropicJsonClient({
        baseUrl: () => provider.baseUrl,
        apiKey: () => provider.apiKey,
        headers: () => provider.headers,
      })
      const client = composeCapabilities(baseClient, [
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
    case "mistral": {
      const baseClient = new MistralJsonClient({
        baseUrl: () => provider.baseUrl,
        apiKey: () => provider.apiKey,
        headers: () => provider.headers,
        provider,
      })
      const client = composeCapabilities(baseClient, [
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
    default: {
      throw new Error(`Unsupported provider type: ${String(provider.type)}`)
    }
  }
}

export async function fetchProviderModels(payload: {
  type: AIProviderSetting["type"]
  baseUrl: string
  apiKey: string
  headers?: string
}): Promise<string[]> {
  const { type, baseUrl, apiKey, headers = "" } = payload
  switch (type) {
    case "gemini": {
      try {
        const client = createGeminiSdkClient({
          baseUrl,
          apiKey,
          headers,
        })
        const pager = await client.models.list()
        return extractGeminiModels(pager.page)
      } catch (error) {
        throw new Error(`Fetch models failed: ${(error as Error).message}`)
      }
    }
    case "anthropic": {
      const client = new BrowserAnthropicRegistryClient({
        apiKey: apiKey || null,
        authToken: null,
        baseURL: buildAnthropicModelsUrl(baseUrl).replace(/\/models\/?$/, ""),
        defaultHeaders: buildAnthropicHeaders(apiKey, headers),
        dangerouslyAllowBrowser: true,
      })
      return extractAnthropicModels(await client.models.list())
    }
    case "mistral": {
      const client = createMistralSdkClient({
        baseUrl,
        apiKey,
        headers,
      })
      return extractMistralModels(
        await client.models.list(undefined, {
          serverURL: buildMistralSdkBaseUrl(baseUrl),
          headers: buildMistralHeaders(headers),
        }),
      )
    }
    case "openai_compatible":
    case "openai_responses": {
      const client = new BrowserOpenAIRegistryClient({
        apiKey: apiKey || "myz-openai-compatible-placeholder",
        baseURL: buildModelsUrl(baseUrl).replace(/\/models\/?$/, ""),
        defaultHeaders: buildProviderHeaders(apiKey, headers),
        dangerouslyAllowBrowser: true,
      })
      return extractOpenAICompatibleModels(await client.models.list())
    }
    default: {
      throw new Error(`Unsupported provider type: ${String(type)}`)
    }
  }
}

export async function testProviderConnection(payload: {
  provider: Pick<
    AIProviderSetting,
    | "baseUrl"
    | "apiKey"
    | "headers"
    | "type"
    | "streamingEnabled"
    | "compatProfile"
    | "reasoningMode"
    | "reasoningEffort"
    | "reasoningBudget"
  >
  model: string
  maxOutputTokens?: number
  maxOutputTokenParam?: MaxOutputTokenParam
}): Promise<{ success: boolean; response?: string; error?: string }> {
  const provider = payload.provider
  const model = typeof payload.model === "string" ? payload.model.trim() : ""
  if (!provider?.baseUrl) {
    throw new Error("Base URL is required")
  }
  if (!model) {
    throw new Error("Model is required")
  }

  const maxOutputTokens =
    typeof payload.maxOutputTokens === "number" && payload.maxOutputTokens > 0
      ? Math.floor(payload.maxOutputTokens)
      : 64
  const maxOutputTokenParam: MaxOutputTokenParam =
    payload?.maxOutputTokenParam === "max_completion_tokens"
      ? "max_completion_tokens"
      : "max_tokens"

  const request: ProviderChatCompletionRequest = {
    model,
    messages: [
      {
        role: "user",
        content:
          "Please respond with 'Connection successful' to confirm the API is working.",
      },
    ],
    temperature: 0.0,
    stream: provider.streamingEnabled !== false,
  }
  if (maxOutputTokenParam === "max_completion_tokens") {
    request.max_completion_tokens = maxOutputTokens
  } else {
    request.max_tokens = maxOutputTokens
  }

  const clients = createProviderClients(
    provider as AIProviderSetting,
    undefined,
  )
  try {
    const response = await clients.client.createCompletion(request, {})
    const rawContent = response?.choices?.[0]?.message?.content
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                isRecord(part) && typeof part.text === "string"
                  ? part.text
                  : "",
              )
              .filter((part) => typeof part === "string" && part)
              .join("\n")
          : ""
    return { success: true, response: text }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

class BrowserOpenAIRegistryClient extends OpenAI {
  protected override validateHeaders() {
    return
  }

  protected override async authHeaders() {
    return undefined
  }
}

class BrowserAnthropicRegistryClient extends Anthropic {
  protected override validateHeaders() {
    return
  }

  protected override async authHeaders() {
    return undefined
  }
}
