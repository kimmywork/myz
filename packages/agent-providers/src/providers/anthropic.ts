import Anthropic from "@anthropic-ai/sdk"
import type { LLMClient, ProviderRequest, ProviderResponse } from "./types"

function splitSystem(msgs: ProviderRequest["messages"]): { system: string; rest: any[] } {
  const system: string[] = []
  const rest: any[] = []
  for (const m of msgs) {
    if (m.role === "system" || m.role === "developer") {
      system.push(m.content)
    } else if (m.role === "user") {
      rest.push({ role: "user", content: m.content })
    } else if (m.role === "assistant") {
      const content: any[] = []
      if (m.content) content.push({ type: "text", text: m.content })
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: safeJson(tc.function.arguments) })
        }
      }
      rest.push({ role: "assistant", content })
    } else if (m.role === "tool") {
      rest.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id || "", content: m.content }] })
    }
  }
  return { system: system.join("\n\n"), rest }
}

function safeJson(s: string): any { try { return JSON.parse(s) } catch { return s } }

export function createAnthropicClient(options: {
  baseUrl?: string
  apiKey: string
  stream?: boolean
}): LLMClient {
  const client = new Anthropic({ baseURL: options.baseUrl, apiKey: options.apiKey })

  return {
    async complete(request) {
      const { system, rest } = splitSystem(request.messages)
      const params: any = {
        model: request.model,
        messages: rest,
        max_tokens: request.max_tokens || 4096,
      }
      if (system) params.system = system
      if (request.tools) {
        params.tools = request.tools.map((t) => ({
          name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
        }))
      }
      if (request.tool_choice === "required") params.tool_choice = { type: "any" }
      else if (request.tool_choice === "none") params.tool_choice = { type: "none" }
      else if (typeof request.tool_choice === "object") params.tool_choice = { type: "tool", name: request.tool_choice.function.name }
      if (request.temperature != null) params.temperature = request.temperature

      const stream = client.messages.stream(params)
      let content = ""
      const toolCalls = new Map<string, { id: string; name: string; args: string }>()

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const d = event.delta as any
          if (d.type === "text_delta") content += d.text
          if (d.type === "input_json_delta") {
            const block = (stream as any)._currentContentBlock
            const id = block?.id || ""
            const e = toolCalls.get(id) || { id, name: "", args: "" }
            e.args += d.partial_json
            toolCalls.set(id, e)
          }
        } else if (event.type === "content_block_start") {
          const b = (event as any).content_block
          if (b?.type === "tool_use") toolCalls.set(b.id, { id: b.id, name: b.name, args: "" })
        }
      }

      const calls = Array.from(toolCalls.values()).map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.args }))
      return { content, toolCalls: calls.length ? calls : undefined, finishReason: "stop" }
    },
  }
}
