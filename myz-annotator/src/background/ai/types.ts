import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ContentBlock } from "../mcp_schema.js"

export type Role = "user" | "assistant" | "tool" | "system"

export interface ToolInvocationDetails {
  id: string
  name: string
  arguments: string
  response?: string
}

export interface Conversation {
  conversationId: string
  title: string
  url: string
  createdAt?: string
  updatedAt?: string
  sendContextEnabled?: boolean
  messages: Message[]
}

export interface Message {
  id: string
  conversationId?: string | null
  role: Role
  content: string
  timestamp: string
  reasoning_content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  metadata?: {
    type?: string
    hasToolCalls?: boolean
    toolInvocationOnly?: boolean
    toolCallDetails?: Array<ToolInvocationDetails>
    [key: string]: any
    toolNames?: string[] | string
    toolCallCount?: number
  }
}

export type ToolParamaterDefinition =
  | {
      type: "object"
      required?: string[]
      properties: Record<string, any>
    }
  | {
      type: "number"
      minimum?: number
      maximum?: number
      default?: number
      description?: string
    }
  | {
      type: "string"
      description?: string
    }

export interface ChatCompletionRequestPayload {
  model: string
  messages: MessageInPayload[]
  max_tokens?: number
  temperature?: number
  tools?: { type: "function"; function: ToolDefinition }[]
  stream?: boolean
  extra_body?: {
    google?: {
      thinking_config?: {
        include_thoughts?: boolean
      }
      [key: string]: any
    }
    [key: string]: any
  }
}

export interface MessageInPayload {
  role: Role
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParamaterDefinition
}

export interface ToolCall {
  id: string
  index?: number
  type: "function"
  thought_signature?: string
  function: {
    name: string
    arguments: string
  }
  [key: string]: any
}

export interface ToolExecutionResult {
  content: ContentBlock[]
  data?: any
  isError?: boolean
}

export interface ChatCompletionMessage {
  role: Role
  content: string
  reasoning_content?: string
  reasoning?: string
  tool_calls?: ToolCall[]
}

export interface ChatCompletionResponsePayload {
  choices: Array<{
    message?: ChatCompletionMessage
    delta?: ChatCompletionMessage
  }>
}

export interface StreamCompletionOptions {
  onStreamDelta?: (delta: { content: string; reasoning: string }) => void
}

export interface GenerateResponseOptions {
  stream?: boolean
  onStreamDelta?: (delta: { content: string; reasoning: string }) => void
  conversationId?: string | null
  temperature?: number
}

export interface ProcessConversationOptions {
  includePageContext?: boolean
  metadata?: Record<string, any>
  toolExecutionTimeoutMs?: number
  stream?: boolean
  streamId?: string
  temperature?: number
}

export interface ContextChunk {
  id: string
  order?: number
  text: string
  prefix: string
}

export interface MessageStreamData {
  conversationId?: string
  streamId: string | null
  message?: Message
  content?: string
  delta?: string
  reasoning?: string
  metadata?: Record<string, any>
  error?: string
}

export interface MessageStream {
  id: string | null
  content: string
  timestamp: string
  reasoning: string
  metadata: Record<string, any>
}

export interface ProcessConversationResult {
  conversationId: string
  content: string
  reasoning: string
  model: string
  timestamp: string
  hasToolCalls: boolean
  toolCallCount: number
  availableTools?: Tool[]
}

export interface PageInsightPayload {
  action: string
  chunks: ContextChunk[]
  title: string
  url: string
  temperature: number
}

export interface AIProviderOptions {
  allowUntested?: boolean
}
