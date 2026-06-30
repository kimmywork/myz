import type { ProviderMessage } from "../providers/types"
import type { Message } from "../types"

export function toProviderMessages(messages: Message[]): ProviderMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
  }))
}
