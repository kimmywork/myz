import type { ChatCompletionClient } from "../providers/types.js"
import type { AIModelSetting, AIProviderSetting, MaxOutputTokenParam } from "../../settings.js"
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

function notifyRuntime(type: string, payload: any) {
  try {
    chrome.runtime
      .sendMessage(payload ? { type, ...payload } : { type })
      .catch(() => {})
  } catch (error) {
    console.warn(`Failed to notify runtime: ${type}`, error)
  }
}

export interface ConversationCallConfig {
  provider: AIProviderSetting
  model: AIModelSetting
  temperature: number
  compressImages: boolean
}

export interface ConversationToolControl {
  listTools: () => Array<{ name: string; description?: string; server?: string }>
  setActiveToolFilter: (toolNames: string[] | null) => void
}

export interface ConversationToolSelector {
  enabled: boolean
  selectToolNames: (
    prompt: string,
    tools: Array<{ name: string; description?: string; server?: string }>,
  ) => Promise<string[]>
}

export class ConversationAgent {
  /**
   * Ensure each conversation starts with a stable environment/system prompt so
   * the model understands it is running inside a browser extension.
   *
   * Notes:
   * - Stored once per conversation (idempotent).
   * - Timestamp is forced to be earlier than any existing message so it stays
   *   at the top of the chronological history (important when page_context is
   *   inserted during conversation creation).
   */
  private async ensureSystemPrompt(
    conversationId: string,
    includePageContext: boolean,
  ): Promise<Message | null> {
    const existing = await getMessagesForConversation(conversationId, 1000)
    const alreadyExists = existing.some(
      (msg) => msg.role === "system" && msg.metadata?.type === "system_prompt",
    )
    if (alreadyExists) return null

    const nowDate = new Date()
    let timeZone = "UTC"
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      timeZone = "UTC"
    }
    const offsetMinutes = -nowDate.getTimezoneOffset()
    const absOffsetMinutes = Math.abs(offsetMinutes)
    const offsetSign = offsetMinutes >= 0 ? "+" : "-"
    const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0")
    const offsetMins = String(absOffsetMinutes % 60).padStart(2, "0")
    const utcOffset = `UTC${offsetSign}${offsetHours}:${offsetMins}`
    const injectedAtLocal = (() => {
      try {
        const parts = new Intl.DateTimeFormat("zh-CN", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).formatToParts(nowDate)
        const map: Record<string, string> = {}
        for (const part of parts) {
          if (part.type !== "literal") {
            map[part.type] = part.value
          }
        }
        const datePart = `${map.year || "0000"}-${map.month || "00"}-${map.day || "00"}`
        const timePart = `${map.hour || "00"}:${map.minute || "00"}:${map.second || "00"}`
        return `${datePart} ${timePart}`
      } catch {
        return nowDate.toLocaleString("zh-CN", { hour12: false })
      }
    })()

    const hasSavedPageContext = existing.some(
      (msg) =>
        msg.metadata?.type === "page_context" ||
        (msg.role === "system" && typeof msg.content === "string" && msg.content.startsWith("页面上下文:")),
    )

    const injectedAt = nowDate.toISOString()
    const now = Date.now()
    const earliestTsMs = existing.reduce((min, msg) => {
      const value = Date.parse(msg.timestamp)
      return Number.isFinite(value) ? Math.min(min, value) : min
    }, now)
    const timestamp = new Date(Math.max(0, earliestTsMs - 1)).toISOString()

    const systemPrompt: Message = {
      id: generateId("sys"),
      conversationId,
      role: "system",
      content: [
        "你是一个 AI 智能助理，辅助用户完成网页浏览时的各种任务。",
        "你正在浏览器扩展（Chrome Extension / MV3 Service Worker）环境中运行。",
        `当前时间: ${injectedAtLocal} (${timeZone}, ${utcOffset})`,
        `本次对话创建时是否启用网页上下文: ${includePageContext ? "是" : "否"}`,
        `当前线程是否已保存网页上下文: ${hasSavedPageContext ? "是" : "否"}`,
      ].join("\n"),
      timestamp,
      metadata: {
        type: "system_prompt",
        injectedAt,
        injectedAtLocal,
        timeZone,
        utcOffset,
        utcOffsetMinutes: offsetMinutes,
        includePageContextAtCreation: includePageContext,
        hasSavedPageContext,
      },
    }

    await saveMessage(systemPrompt)
    this.notifyNewMessage(conversationId, systemPrompt)
    return systemPrompt
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
        (msg) =>
          msg.metadata?.type !== "page_context" &&
          (msg.role !== "system" || msg.metadata?.type === "system_prompt"),
      )
    }

    if (messages.length === 0) {
      const legacy = await readAiConversations()
      const conv = legacy?.conversations?.[conversationId]
      if (conv?.messages?.length) {
        const legacyMessages = includePageContext
          ? conv.messages
          : conv.messages.filter(
              (msg: Message) =>
                msg.role !== "system" || msg.metadata?.type === "system_prompt",
            )
        return legacyMessages
      }
    }

    return messages
  }

  private async persistToolCallMessage(
    conversationId: string | null,
    action: string,
    message: any,
    callConfig: ConversationCallConfig,
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
        model: callConfig.model.model,
        providerId: callConfig.provider.id,
        providerName: callConfig.provider.name,
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
    deps: {
      client: ChatCompletionClient
      isEnabled: boolean
      callConfig: ConversationCallConfig
      toolControl?: ConversationToolControl
      toolSelector?: ConversationToolSelector
    },
  ): Promise<ProcessConversationResult> {
    if (!deps.isEnabled) {
      throw new Error("AI Assistant is not enabled")
    }

    const {
      includePageContext = true,
      metadata = {},
      attachments = [],
      stream = false,
      streamId,
      ...restOptions
    } = options

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.filter((item: any) => item?.type === "image" && typeof item?.dataUrl === "string" && item.dataUrl)
      : []

    if (
      normalizedAttachments.length > 0 &&
      !deps.callConfig.model.capabilities.vision
    ) {
      throw new Error("当前模型不支持 Vision，无法发送图片")
    }

    const injectedSystemPrompt = await this.ensureSystemPrompt(
      conversationId,
      includePageContext,
    )

    if (deps.toolControl) {
      deps.toolControl.setActiveToolFilter(null)
      if (deps.toolSelector?.enabled) {
        try {
          const tools = (deps.toolControl.listTools() || []).map((tool) => ({
            name: tool?.name || "",
            description: tool?.description || "",
            server: tool?.server || "",
          }))
          const selected = await deps.toolSelector.selectToolNames(content, tools)
          deps.toolControl.setActiveToolFilter(selected)
        } catch (error) {
          console.warn("Tool selection failed, disabling tools for this request", error)
          deps.toolControl.setActiveToolFilter([])
        }
      }
    }

    // Build the payload history before persisting the new user message so we
    // don't depend on IndexedDB write visibility timing.
    const historyMessages = await this.getConversationMessages(
      conversationId,
      includePageContext,
    )
    const historyHasSystemPrompt = historyMessages.some(
      (msg) => msg.role === "system" && msg.metadata?.type === "system_prompt",
    )

    const userMessage: Message = {
      id: generateId(),
      conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        action,
        ...metadata,
        ...(normalizedAttachments.length ? { attachments: normalizedAttachments } : {}),
      },
    }
    await saveMessage(userMessage)

    const payloadMessages: Message[] = []
    if (!historyHasSystemPrompt && injectedSystemPrompt) {
      payloadMessages.push(injectedSystemPrompt)
    }
    payloadMessages.push(...historyMessages, userMessage)
    const historyPayload: MessageInPayload[] =
      buildConversationPromptMessages(payloadMessages, {
        includeVision: deps.callConfig.model.capabilities.vision,
      })

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
          model: deps.callConfig.model.model,
          providerId: deps.callConfig.provider.id,
          providerName: deps.callConfig.provider.name,
          action,
          streaming: true,
        },
      })
    }

    const model = deps.callConfig.model.model
    const maxOutputTokens = deps.callConfig.model.limits.maxOutputTokens
    const maxOutputTokenParam: MaxOutputTokenParam =
      deps.callConfig.model.limits.maxOutputTokenParam
    const temperature = deps.callConfig.temperature

    let response: any
    try {
      const request: any = {
        model,
        messages: historyPayload,
        temperature: typeof restOptions.temperature === "number" ? restOptions.temperature : temperature,
        stream,
      }
      if (maxOutputTokenParam === "max_completion_tokens") {
        request.max_completion_tokens = maxOutputTokens
      } else {
        request.max_tokens = maxOutputTokens
      }

      response = await deps.client.createCompletion(
        request,
        {
          enableGeminiThinking: Boolean(deps.callConfig.model.capabilities.reasoning),
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
            this.persistToolCallMessage(conversationId, action, message, deps.callConfig),
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
    } finally {
      if (deps.toolControl) {
        deps.toolControl.setActiveToolFilter(null)
      }
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
        model: deps.callConfig.model.model,
        providerId: deps.callConfig.provider.id,
        providerName: deps.callConfig.provider.name,
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
      model: deps.callConfig.model.model,
      timestamp: assistantMessage.timestamp,
      hasToolCalls: !!message?.tool_calls,
      toolCallCount: message?.tool_calls?.length || 0,
    }
  }
}
