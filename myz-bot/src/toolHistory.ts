import type { Message } from "@myz/ai-core/types"
import {
  appendMessage,
  appendTraceMessage,
  createAssistantMessage,
  createToolMessage,
} from "./sessions"

type ToolTraceEntry = {
  role: string
  content: unknown
  tool_calls?: unknown
  tool_call_id?: unknown
  metadata?: Record<string, unknown>
}

export function appendToolAuditTrace(options: {
  sessionId: string
  sessionDir: string
  trace: ToolTraceEntry[]
}) {
  options.trace.forEach((entry) => {
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      const assistantMessage = createAssistantMessage(
        options.sessionId,
        typeof entry.content === "string" ? entry.content : "",
        {
          type: "tool_audit",
          toolInvocationOnly: true,
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      assistantMessage.tool_calls = entry.tool_calls as Message["tool_calls"]
      appendTraceMessage(options.sessionDir, assistantMessage)
      return
    }

    if (entry.role === "tool" && typeof entry.tool_call_id === "string") {
      const toolMessage = createToolMessage(
        options.sessionId,
        typeof entry.content === "string" ? entry.content : "",
        entry.tool_call_id,
        {
          type: "tool_audit",
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      appendTraceMessage(options.sessionDir, toolMessage)
    }
  })
}

export function appendToolMessagesToSessionHistory(options: {
  sessionId: string
  sessionDir: string
  trace: ToolTraceEntry[]
}) {
  options.trace.forEach((entry) => {
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      const assistantMessage = createAssistantMessage(
        options.sessionId,
        typeof entry.content === "string" ? entry.content : "",
        entry.metadata || {},
      )
      assistantMessage.tool_calls = entry.tool_calls as Message["tool_calls"]
      appendMessage(options.sessionDir, assistantMessage)
      return
    }

    if (entry.role === "tool" && typeof entry.tool_call_id === "string") {
      const toolMessage = createToolMessage(
        options.sessionId,
        typeof entry.content === "string" ? entry.content : "",
        entry.tool_call_id,
        entry.metadata || {},
      )
      appendMessage(options.sessionDir, toolMessage)
    }
  })
}
