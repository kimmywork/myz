export type ProviderRole = "system" | "user" | "assistant" | "tool"

export interface ProviderToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
  extra_content?: Record<string, any>
  [key: string]: any
}

export interface ProviderMessage {
  role: ProviderRole
  content: string | any[]
  tool_calls?: ProviderToolCall[]
  tool_call_id?: string
  extra_content?: Record<string, any>
  [key: string]: any
}

export interface ProviderToolDefinition {
  name: string
  description: string
  parameters: any
}

export interface ProviderToolSpec {
  type: "function"
  function: ProviderToolDefinition
}

export interface ProviderChatCompletionRequest {
  model: string
  messages: ProviderMessage[]
  max_tokens?: number
  temperature?: number
  tools?: ProviderToolSpec[]
  stream?: boolean
  extra_body?: Record<string, any>
  [key: string]: any
}

export interface ProviderChatCompletionChoice {
  index: number
  finish_reason?: string
  message?: ProviderMessage
  delta?: Partial<ProviderMessage>
  [key: string]: any
}

export interface ProviderChatCompletionResponse {
  choices?: ProviderChatCompletionChoice[]
  [key: string]: any
}

export interface ProviderStreamDelta {
  content?: string
  reasoning?: string
  tool_calls?: ProviderToolCall[]
  [key: string]: any
}

export interface ProviderStreamOptions {
  onStreamDelta?: (delta: ProviderStreamDelta) => void
  onToolCallMessage?: (message: ProviderMessage) => void | Promise<void>
  onToolResultMessage?: (message: ProviderMessage) => void | Promise<void>
}

export interface ChatCompletionClient {
  createCompletion(
    request: ProviderChatCompletionRequest,
    options?: ProviderStreamOptions,
  ): Promise<ProviderChatCompletionResponse>
}
