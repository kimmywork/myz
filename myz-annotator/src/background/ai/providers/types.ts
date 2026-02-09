export type ProviderRole = "system" | "developer" | "user" | "assistant" | "tool"

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
  strict?: boolean
}

export interface ProviderToolSpec {
  type: "function"
  function: ProviderToolDefinition
}

type ReasoningEffort = "low" | "medium" | "high";

type ResponseFormat = "text" | { "type": "json_object" } | { "type": "json_schema"; "json_schema": any };

export type ProviderToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } }
  | { type: "function"; name: string }

export interface ProviderChatCompletionRequest {
  model: string
  messages: ProviderMessage[]
  max_tokens?: number
  temperature?: number
  tools?: ProviderToolSpec[]
  tool_choice?: ProviderToolChoice
  parallel_tool_calls?: boolean
  stream?: boolean
  response_format?: ResponseFormat
  reasoning_effort?: ReasoningEffort
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
  tooling?: {
    toolChoice?: ProviderToolChoice
    parallelToolCalls?: boolean
    strict?: boolean
  }
  /**
   * Gemini OpenAI-compatible "thinking" output is controlled by
   * `extra_body.google.thinking_config.include_thoughts`.
   *
   * Only enable it when the selected model is configured to support reasoning.
   */
  enableGeminiThinking?: boolean
}

export interface ChatCompletionClient {
  createCompletion(
    request: ProviderChatCompletionRequest,
    options?: ProviderStreamOptions,
  ): Promise<ProviderChatCompletionResponse>
}
