export type Role = "user" | "assistant" | "tool" | "system"

export interface Message {
  role: Role
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  metadata?: Record<string, unknown>
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  content: string
  isError?: boolean
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}
