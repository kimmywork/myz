import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ContentBlock } from "./mcp_schema"
import { AI_SCHEMA_VERSION } from "@myz/shared/versioning"
import type { JsonRecord, JsonValue } from "@myz/shared/typeUtils"

export type Role = "user" | "assistant" | "tool" | "system"

export const AI_MESSAGE_SCHEMA_VERSION = AI_SCHEMA_VERSION

export interface ToolInvocationDetails {
  id: string
  name: string
  arguments: string
  response?: string
  [key: string]: JsonValue | undefined
}

export interface Conversation {
  schemaVersion?: string
  conversationId: string
  title: string
  url: string
  createdAt?: string
  updatedAt?: string
  sendContextEnabled?: boolean
  messages: Message[]
}

export interface ConversationInfo {
  schemaVersion?: string
  id: string
  title: string
  url: string
  createdAt: string
  updatedAt: string
  metadata?: JsonRecord
  sendContextEnabled?: boolean
}

export interface Message {
  schemaVersion?: string
  id: string
  conversationId?: string | null
  role: Role
  content: string
  timestamp: string
  reasoning_content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  metadata?: MessageMetadata
}

export interface TokenUsage {
  total_tokens?: number
  completion_tokens?: number
  prompt_tokens?: number
  reasoning_tokens?: number
  totalTokens?: number
  completionTokens?: number
  promptTokens?: number
  reasoningTokens?: number
}

export interface MessageMetadata {
  type?: string
  hasToolCalls?: boolean
  toolInvocationOnly?: boolean
  toolCallDetails?: Array<ToolInvocationDetails>
  toolNames?: string[] | string
  toolCallCount?: number
  model?: string
  reasoning?: string
  reasoning_content?: string
  usage?: TokenUsage
  contextWindow?: number
  requestDurationMs?: number
  streaming?: boolean
  streamingError?: string
  toolName?: string
  toolArgs?: string
  error?: string
  selectedToolNames?: string[]
  need?: string
  savedAsHighlight?: boolean
  selectionContextText?: string
  skillNames?: string[]
  attachments?: ImageAttachment[]
  pageTitle?: string
  titleGenerated?: boolean
  [key: string]: unknown
}

export interface ImageAttachment {
  type: "image"
  dataUrl: string
  mimeType?: string
  name?: string
  [key: string]: JsonValue | undefined
}

export type OpenAIMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type MessageContent = string | OpenAIMessageContentPart[]

export type ToolParamaterDefinition =
  | {
      type: "object"
      required?: string[]
      properties: Record<string, JsonValue>
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
  tool_choice?: JsonValue
  parallel_tool_calls?: boolean
  stream?: boolean
  extra_body?: {
    google?: {
      thinking_config?: {
        include_thoughts?: boolean
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

export interface MessageInPayload {
  role: Role
  content: MessageContent
  tool_calls?: ToolCall[]
  tool_call_id?: string
  [key: string]: unknown
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParamaterDefinition
  strict?: boolean
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
  [key: string]: JsonValue | undefined
}

export interface ToolExecutionResult {
  content: ContentBlock[]
  data?: unknown
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
  metadata?: JsonRecord
  toolExecutionTimeoutMs?: number
  attachments?: ImageAttachment[]
  stream?: boolean
  streamId?: string
  temperature?: number
  requiredToolNames?: string[]
  conversationMode?: "agent" | "chat"
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
  metadata?: MessageMetadata
  error?: string
  clientMessageId?: string
  skillNames?: string[]
}

export interface MessageStream {
  id: string | null
  content: string
  timestamp: string
  reasoning: string
  metadata: MessageMetadata
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
