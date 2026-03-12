import {
  createProviderSession,
} from "@myz/ai-core/runtime/providerSession"
import { buildConversationPromptMessages } from "@myz/ai-core/prompt/conversation"
import type { Message } from "@myz/ai-core/types"
import type {
  ProviderChatCompletionRequest,
  ProviderToolChoice,
} from "@myz/ai-core/providers/types"
import type {
  AIProviderSetting,
  AIModelSetting,
  McpServerSetting,
  AIToolChoiceMode,
  AIToolFlagSetting,
  AIToolChoiceSetting,
  AIToolControlSettings,
} from "@myz/ai-core/settings"
import type { BotConfig } from "./config"

function normalizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!headers) return normalized
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      normalized[key] = value
      return
    }
    if (typeof value === "number" || typeof value === "boolean") {
      normalized[key] = String(value)
    }
  })
  return normalized
}

function headersToString(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

function normalizeToolChoice(
  setting: AIToolChoiceSetting | undefined,
): ProviderToolChoice | undefined {
  if (!setting) return undefined
  const mode = setting.mode
  if (mode === "auto" || mode === "none" || mode === "required") return mode
  if (mode === "tool" && setting.toolName) {
    return { type: "function", function: { name: setting.toolName } }
  }
  return undefined
}

function normalizeFlag(value: AIToolFlagSetting | undefined) {
  if (value === "on") return true
  if (value === "off") return false
  return undefined
}

function normalizeTooling(settings: AIToolControlSettings | undefined) {
  if (!settings) return undefined
  return {
    toolChoice: normalizeToolChoice(settings.toolChoice),
    strict: normalizeFlag(settings.strict),
    parallelToolCalls: normalizeFlag(settings.parallelToolCalls),
  }
}

function buildModel(config: BotConfig): AIModelSetting {
  const limits = config.ai.limits
  const tooling = config.ai.tooling
  return {
    id: "bot-model",
    model: config.ai.model,
    enabled: true,
    capabilities: {
      vision: Boolean(config.ai.capabilities?.vision),
      imageOutput: Boolean(config.ai.capabilities?.imageOutput),
      toolCalling: Boolean(config.ai.capabilities?.toolCalling),
      reasoning: Boolean(config.ai.capabilities?.reasoning),
    },
    limits: {
      contextWindow: limits.contextWindow,
      maxOutputTokens: limits.maxOutputTokens,
      maxOutputTokenParam: limits.maxOutputTokenParam,
    },
    tooling: {
      toolChoice: {
        mode: tooling.toolChoice as AIToolChoiceMode,
      },
      strict: tooling.strict as AIToolFlagSetting,
      parallelToolCalls: tooling.parallelToolCalls as AIToolFlagSetting,
    },
  }
}

function buildProvider(config: BotConfig, model: AIModelSetting): AIProviderSetting {
  const headers = normalizeHeaders(config.ai.headers)
  return {
    id: "bot-provider",
    name: "myz-bot",
    type: config.ai.provider as AIProviderSetting["type"],
    enabled: true,
    streamingEnabled: true,
    baseUrl: config.ai.baseUrl || "",
    apiKey: config.ai.accessToken || "",
    headers: headersToString(headers),
    models: [model],
    lastTest: {
      ok: true,
      message: "boot",
      testedAt: new Date().toISOString(),
      model: model.model,
    },
  }
}

function buildMcpServers(config: BotConfig): McpServerSetting[] {
  return (config.mcpServers || []).map((server, index) => ({
    id: server.id || `mcp-${index}`,
    name: server.name,
    enabled: server.enabled !== false,
    url: server.url,
    headers: normalizeHeaders(server.headers),
    lastTest: null,
  }))
}

export async function generateReply(options: {
  config: BotConfig
  messages: Message[]
  temperature?: number
  conversationId?: string
}) {
  const model = buildModel(options.config)
  const provider = buildProvider(options.config, model)
  const mcpServers = buildMcpServers(options.config)
  const session = createProviderSession(provider, mcpServers)

  const useTools = Boolean(model.capabilities.toolCalling)
  if (useTools) {
    await session.connectMcp()
    if (options.conversationId) {
      session.mcp.setConversationContext({
        conversationId: options.conversationId,
      })
    }
  }

  try {
    const payload = buildConversationPromptMessages(options.messages, {
      includeVision: Boolean(model.capabilities.vision),
    })

    const request: ProviderChatCompletionRequest = {
      model: model.model,
      messages: payload,
      temperature: typeof options.temperature === "number" ? options.temperature : 0.7,
      stream: false,
    }

    if (model.limits.maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = model.limits.maxOutputTokens
    } else {
      request.max_tokens = model.limits.maxOutputTokens
    }

    const client = useTools ? session.clientWithTools : session.client
    const response = await client.createCompletion(request, {
      tooling: normalizeTooling(model.tooling),
      enableGeminiThinking: Boolean(model.capabilities.reasoning),
    })

    const message = response?.choices?.[0]?.message
    return {
      content: typeof message?.content === "string" ? message.content : "",
      toolCalls: message?.tool_calls || [],
      usage: message?.usage,
    }
  } finally {
    if (useTools) {
      await session.disconnectMcp()
    }
  }
}
