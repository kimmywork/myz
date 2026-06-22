import { Mistral } from "@mistralai/mistralai"
import type { LLMClient, ProviderRequest, ProviderResponse } from "./types"

function toMistralMessages(msgs: ProviderRequest["messages"]): any[] {
  return msgs.map((m) => {
    if (m.role === "tool") return { role: "tool", content: m.content, toolCallId: m.tool_call_id }
    if (m.role === "assistant" && m.tool_calls) {
      return { role: "assistant", content: m.content || "", toolCalls: m.tool_calls.map((tc) => ({
        id: tc.id, function: { name: tc.function.name, arguments: tc.function.arguments },
      })) }
    }
    return { role: m.role, content: m.content }
  })
}

export function createMistralClient(options: { apiKey: string; stream?: boolean }): LLMClient {
  const client = new Mistral({ apiKey: options.apiKey })

  return {
    async complete(request) {
      const params: any = { model: request.model, messages: toMistralMessages(request.messages) }
      if (request.tools) {
        params.tools = request.tools.map((t) => ({
          type: "function", function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
        }))
      }
      if (request.temperature != null) params.temperature = request.temperature
      if (request.max_tokens) params.maxTokens = request.max_tokens

      const stream = await client.chat.stream(params)
      let content = ""
      const toolCalls = new Map<number, { id: string; name: string; args: string }>()

      for await (const chunk of stream) {
        const delta = chunk.data?.choices?.[0]?.delta as any
        if (!delta) continue
        if (delta.content) content += delta.content
        const raw = delta.toolCalls || delta.tool_calls
        if (Array.isArray(raw)) {
          for (const tc of raw) {
            const i = tc.index ?? 0
            const e = toolCalls.get(i) || { id: "", name: "", args: "" }
            if (tc.id) e.id = tc.id
            if (tc.function?.name) e.name = tc.function.name
            if (tc.function?.arguments) e.args += tc.function.arguments
            toolCalls.set(i, e)
          }
        }
      }

      const calls = Array.from(toolCalls.values()).map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.args }))
      return { content, toolCalls: calls.length ? calls : undefined, finishReason: "stop" }
    },
  }
}
