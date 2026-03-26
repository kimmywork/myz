import type { Message } from "@myz/ai-core/types"
import {
  appendMessage,
  appendTraceMessage,
  createAssistantMessage,
  createToolMessage,
} from "./conversations"

type ToolTraceEntry = {
  role: string
  content: unknown
  tool_calls?: unknown
  tool_call_id?: unknown
  metadata?: Record<string, unknown>
}

export function appendToolAuditTrace(options: {
  conversationId: string
  conversationDir: string
  trace: ToolTraceEntry[]
}) {
  options.trace.forEach((entry) => {
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      const assistantMessage = createAssistantMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        {
          type: "tool_audit",
          toolInvocationOnly: true,
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      assistantMessage.tool_calls = entry.tool_calls as Message["tool_calls"]
      appendTraceMessage(options.conversationDir, assistantMessage)
      return
    }

    if (entry.role === "tool" && typeof entry.tool_call_id === "string") {
      const toolMessage = createToolMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        entry.tool_call_id,
        {
          type: "tool_audit",
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      appendTraceMessage(options.conversationDir, toolMessage)
    }
  })
}

export function appendToolMessagesToHistory(options: {
  conversationId: string
  conversationDir: string
  trace: ToolTraceEntry[]
}) {
  options.trace.forEach((entry) => {
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      const assistantMessage = createAssistantMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        entry.metadata || {},
      )
      assistantMessage.tool_calls = entry.tool_calls as Message["tool_calls"]
      appendMessage(options.conversationDir, assistantMessage)
      return
    }

    if (entry.role === "tool" && typeof entry.tool_call_id === "string") {
      const toolMessage = createToolMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        entry.tool_call_id,
        entry.metadata || {},
      )
      appendMessage(options.conversationDir, toolMessage)
    }
  })
}
