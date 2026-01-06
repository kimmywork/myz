import type { ChatCompletionClient } from "../providers/types.js"
import type {
  AIAssistantSettings,
  AIProviderSetting,
} from "../../settings.js"
import type {
  Message,
  MessageInPayload,
  ProcessConversationOptions,
  ProcessConversationResult,
  ToolInvocationDetails,
  MessageStreamData,
} from "../types.js"
import { saveMessage, getMessagesForConversation } from "../../../sidepanel/aiStorage.js"
import { readAiConversations } from "../../ai.js"
import { normalizeMessagePayload } from "../normalize/message.js"
import { buildConversationPromptMessages } from "../prompt/conversation.js"

function generateId(prefix = "msg") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function resolveModel(
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>,
): string {
  let model = settings.model || settings.aiModel || "gpt-4"
  if (model === "custom" && (settings.customModel || settings.aiCustomModel)) {
    model = settings.customModel || settings.aiCustomModel || model
  }
  return model
}

function notifyRuntime(type: string, payload: any) {
  try {
    chrome.runtime
      .sendMessage(payload ? { type, ...payload } : { type })
      .catch(() => {})
  } catch (error) {
    console.warn(`Failed to notify runtime: ${type}`, error)
  }
}

export interface ConversationAgentOptions {
  isEnabled: boolean
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>
  client: ChatCompletionClient
}

export class ConversationAgent {
  private isEnabled: boolean
  private settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>
  private client: ChatCompletionClient

  constructor(options: ConversationAgentOptions) {
    this.isEnabled = Boolean(options.isEnabled)
    this.settings = options.settings || {}
    this.client = options.client
  }

  private notifyNewMessage(conversationId: string | null, message: Message) {
    notifyRuntime("myz:newMessage", {
      data: {
        conversationId,
        message,
      },
    })
  }

  private notifyStreamStart(conversationId: string, message: Partial<Message>) {
    notifyRuntime("myz:aiStreamStart", {
      data: {
        conversationId,
        message,
      },
    })
  }

  private notifyStreamDelta(conversationId: string, payload: MessageStreamData) {
    notifyRuntime("myz:aiStreamChunk", {
      data: {
        conversationId,
        ...payload,
      },
    })
  }

  private notifyStreamComplete(conversationId: string, payload: MessageStreamData) {
    notifyRuntime("myz:aiStreamComplete", {
      data: {
        conversationId,
        ...payload,
      },
    })
  }

  private notifyStreamError(conversationId: string, payload: MessageStreamData) {
    notifyRuntime("myz:aiStreamError", {
      data: {
        conversationId,
        ...payload,
      },
    })
  }

  private async getConversationMessages(
    conversationId: string,
    includePageContext = true,
  ): Promise<Message[]> {
    let messages = await getMessagesForConversation(conversationId, 1000)

    if (!includePageContext) {
      messages = messages.filter(
        (msg) => msg.metadata?.type !== "page_context" && msg.role !== "system",
      )
    }

    if (messages.length === 0) {
      const legacy = await readAiConversations()
      const conv = legacy?.conversations?.[conversationId]
      if (conv?.messages?.length) {
        const legacyMessages = includePageContext
          ? conv.messages
          : conv.messages.filter((msg: Message) => msg.role !== "system")
        return legacyMessages
      }
    }

    return messages
  }

  private async persistToolCallMessage(
    conversationId: string | null,
    action: string,
    message: any,
  ) {
    if (!conversationId) return
    if (!message?.tool_calls || !message.tool_calls.length) return

    const toolCallDetails = message.tool_calls.map((call: any, index: number) => ({
      id: call.id || `tool-${index + 1}`,
      name: call.function?.name || "unknown",
      arguments: call.function?.arguments || "",
    }))
    const toolNames = toolCallDetails.map((detail: any) => detail.name)
    const { content: normalizedContent, reasoning: reasoningContent } =
      normalizeMessagePayload(message)

    const toolCallMessage: Message = {
      id: generateId(),
      conversationId,
      role: "assistant",
      content: normalizedContent || "",
      tool_calls: message.tool_calls,
      timestamp: new Date().toISOString(),
      metadata: {
        model: this.settings.aiModel,
        action,
        hasToolCalls: true,
        toolCallCount: message.tool_calls.length,
        toolNames,
        toolCallDetails,
        ...(reasoningContent ? { reasoning: reasoningContent } : {}),
      },
    }
    if (reasoningContent) {
      toolCallMessage.reasoning_content = reasoningContent
    }

    await saveMessage(toolCallMessage)
    this.notifyNewMessage(conversationId, toolCallMessage)
  }

  private async persistToolResultMessage(
    conversationId: string | null,
    message: any,
  ) {
    if (!conversationId) return
    if (message?.role !== "tool") return

    const persisted: Message = {
      id: generateId(),
      conversationId,
      role: "tool",
      content: typeof message.content === "string" ? message.content : "",
      tool_call_id: message.tool_call_id,
      timestamp: new Date().toISOString(),
      metadata: {
        ...(message.metadata || {}),
      },
    }

    await saveMessage(persisted)
    this.notifyNewMessage(conversationId, persisted)
  }

  async processConversation(
    conversationId: string,
    action: string,
    content: string,
    options: ProcessConversationOptions = {},
  ): Promise<ProcessConversationResult> {
    if (!this.isEnabled) {
      throw new Error("AI Assistant is not enabled")
    }

    const {
      includePageContext = true,
      metadata = {},
      stream = false,
      streamId,
      ...restOptions
    } = options

    const userMessage: Message = {
      id: generateId(),
      conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      metadata: { action, ...metadata },
    }
    await saveMessage(userMessage)

    const historyMessages = await this.getConversationMessages(
      conversationId,
      includePageContext,
    )
    const historyPayload: MessageInPayload[] =
      buildConversationPromptMessages(historyMessages)

    let streamMessageId: string | null = null
    if (stream) {
      const startedStreamId = streamId || generateId("stream")
      streamMessageId = startedStreamId
      this.notifyStreamStart(conversationId, {
        id: startedStreamId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        metadata: {
          model: this.settings.aiModel,
          action,
          streaming: true,
        },
      })
    }

    const model = resolveModel(this.settings)
    const maxTokens = this.settings.aiMaxTokens || 32768

    let response: any
    try {
      response = await this.client.createCompletion(
        {
          model,
          messages: historyPayload,
          max_tokens: maxTokens,
          temperature: restOptions.temperature ?? 0.7,
          stream,
        } as any,
        {
          onStreamDelta: stream
            ? (delta: any) => {
                if (!delta) return
                const payload =
                  typeof delta === "string"
                    ? { delta }
                    : {
                        delta: delta?.content ?? (delta as any)?.delta ?? "",
                        reasoning: delta?.reasoning ?? "",
                      }
                if (!payload.delta && !payload.reasoning) {
                  return
                }
                this.notifyStreamDelta(conversationId, {
                  streamId: streamMessageId,
                  ...payload,
                } as any)
              }
            : undefined,
          onToolCallMessage: async (message: any) =>
            this.persistToolCallMessage(conversationId, action, message),
          onToolResultMessage: async (message: any) =>
            this.persistToolResultMessage(conversationId, message),
        } as any,
      )
    } catch (error) {
      if (stream && streamMessageId) {
        this.notifyStreamError(conversationId, {
          streamId: streamMessageId,
          error: (error as Error).message,
        } as any)
      }
      throw error
    }

    const message = response?.choices?.[0]?.message
    const { content: normalizedContent, reasoning: reasoningContent } =
      normalizeMessagePayload(message)
    let assistantContent = normalizedContent || ""

    let toolNamesList: string[] = []
    let toolCallDetails: ToolInvocationDetails[] = []
    const assistantHadContent = Boolean(
      (normalizedContent || "").trim() || (reasoningContent || "").trim(),
    )

    if (message?.tool_calls && message.tool_calls.length > 0) {
      toolNamesList = message.tool_calls.map(
        (call: any) => call.function?.name || "unknown",
      )
      toolCallDetails = message.tool_calls.map((call: any, index: number) => ({
        id: call.id || `tool-${index + 1}`,
        name: call.function?.name || "unknown",
        arguments: call.function?.arguments || "",
      }))
    }

    const assistantMessage: Message = {
      id: generateId(),
      conversationId,
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
      metadata: {
        model: this.settings.aiModel,
        action,
        hasToolCalls: !!message?.tool_calls,
        toolCallCount: message?.tool_calls?.length || 0,
        toolNames: toolNamesList,
        toolCallDetails,
        toolInvocationOnly: !assistantHadContent && toolNamesList.length > 0,
        reasoning: reasoningContent || undefined,
        ...metadata,
      },
    }
    if (reasoningContent) {
      assistantMessage.reasoning_content = reasoningContent
    }

    await saveMessage(assistantMessage)

    if (stream && streamMessageId) {
      this.notifyStreamComplete(conversationId, {
        streamId: streamMessageId,
        content: assistantContent,
        reasoning: reasoningContent || "",
        metadata: {
          toolNames: toolNamesList,
          toolCallDetails,
          reasoning: reasoningContent || "",
        },
        message: assistantMessage,
      } as any)
    }

    return {
      conversationId,
      content: assistantContent,
      reasoning: reasoningContent || "",
      model: this.settings.aiModel!,
      timestamp: assistantMessage.timestamp,
      hasToolCalls: !!message?.tool_calls,
      toolCallCount: message?.tool_calls?.length || 0,
    }
  }
}

