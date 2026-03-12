import type { AIProviderSetting, MaxOutputTokenParam } from "../settings"
import {
  buildChatCompletionsUrl,
  buildModelsUrl,
  buildProviderHeaders,
  extractOpenAICompatibleModels,
} from "../runtime/openaiCompatible"
import {
  AnthropicJsonClient,
  buildAnthropicHeaders,
  buildAnthropicModelsUrl,
  extractAnthropicModels,
} from "./anthropic/jsonClient"
import { createQwenThinkingCapability } from "./capabilities/qwenThinking"
import { createReasoningNormalizationCapability } from "./capabilities/reasoning"
import { createToolCallingCapability } from "./capabilities/toolCalling"
import { composeCapabilities } from "./capability"
import type { ProviderToolingOptions, ProviderClients } from "./factory"
import type { ProviderChatCompletionRequest } from "./types"
import { createOpenAICompatibleClients } from "./factory"
import {
  GeminiJsonClient,
  buildGeminiHeaders,
  buildGeminiModelsUrl,
  extractGeminiModels,
} from "./gemini/jsonClient"
import {
  OllamaJsonClient,
  buildOllamaHeaders,
  buildOllamaTagsUrl,
  extractOllamaModels,
} from "./ollama/jsonClient"
import { OpenAIResponsesJsonClient } from "./openaiResponses/jsonClient"
import { isRecord } from "@myz/shared/typeUtils"

export function createProviderClients(
  provider: AIProviderSetting,
  tooling?: ProviderToolingOptions,
): ProviderClients {
  switch (provider.type) {
    case "openai_compatible":
    case "moonshot":
    case "qwen":
    case "vllm":
    case "llama_cpp": {
      const endpoint = buildChatCompletionsUrl(provider.baseUrl)
      const headers = buildProviderHeaders(provider.apiKey, provider.headers)
      const extraCapabilities =
        provider.type === "qwen" ? [createQwenThinkingCapability()] : []
      return createOpenAICompatibleClients(
        {
          endpoint: () => endpoint,
          buildHeaders: () => headers,
        },
        tooling,
        { extraCapabilities },
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
    case "ollama": {
      const baseClient = new OllamaJsonClient({
        baseUrl: () => provider.baseUrl,
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
    default: {
      const endpoint = buildChatCompletionsUrl(provider.baseUrl)
      const headers = buildProviderHeaders(provider.apiKey, provider.headers)
      return createOpenAICompatibleClients(
        {
          endpoint: () => endpoint,
          buildHeaders: () => headers,
        },
        tooling,
      )
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
      const url = buildGeminiModelsUrl(baseUrl)
      const response = await fetch(url, {
        method: "GET",
        headers: buildGeminiHeaders(apiKey, headers),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Fetch models failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }
      return extractGeminiModels(await response.json())
    }
    case "anthropic": {
      const url = buildAnthropicModelsUrl(baseUrl)
      const response = await fetch(url, {
        method: "GET",
        headers: buildAnthropicHeaders(apiKey, headers),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Fetch models failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }
      return extractAnthropicModels(await response.json())
    }
    case "ollama": {
      const url = buildOllamaTagsUrl(baseUrl)
      const response = await fetch(url, {
        method: "GET",
        headers: buildOllamaHeaders(headers),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Fetch models failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }
      return extractOllamaModels(await response.json())
    }
    case "openai_compatible":
    case "openai_responses":
    case "moonshot":
    case "qwen":
    case "vllm":
    case "llama_cpp":
    default: {
      const url = buildModelsUrl(baseUrl)
      const response = await fetch(url, {
        method: "GET",
        headers: buildProviderHeaders(apiKey, headers),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Fetch models failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }
      return extractOpenAICompatibleModels(await response.json())
    }
  }
}

export async function testProviderConnection(payload: {
  provider: Pick<AIProviderSetting, "baseUrl" | "apiKey" | "headers" | "type">
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
