export interface ProviderMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: ProviderToolCall[]
  tool_call_id?: string
}

export interface ProviderToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ProviderToolSpec {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ProviderToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } }

export interface ProviderRequest {
  model: string
  messages: ProviderMessage[]
  tools?: ProviderToolSpec[]
  tool_choice?: ProviderToolChoice
  temperature?: number
  max_tokens?: number
  stream?: boolean
  reasoning_effort?: "low" | "medium" | "high"
  onStreamDelta?: (delta: { content?: string; reasoning?: string }) => void
  [key: string]: unknown
}

export interface ProviderResponse {
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  finishReason?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    reasoningTokens?: number
  }
}

export interface LLMClient {
  complete(request: ProviderRequest): Promise<ProviderResponse>
}
