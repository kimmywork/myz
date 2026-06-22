import OpenAI from "openai"
import type { LLMClient, ProviderRequest, ProviderResponse } from "./types"

function toResponsesInput(msgs: ProviderRequest["messages"]): any[] {
  const input: any[] = []
  for (const m of msgs) {
    if (m.role === "system" || m.role === "developer") continue
    if (m.role === "user") {
      input.push({ type: "message", role: "user", content: [{ type: "input_text", text: m.content }] })
    } else if (m.role === "assistant") {
      const output: any[] = []
      if (m.content) output.push({ type: "output_text", text: m.content })
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          output.push({ type: "function_call", id: tc.id, name: tc.function.name, arguments: tc.function.arguments })
        }
      }
      input.push({ type: "message", role: "assistant", content: output })
    } else if (m.role === "tool") {
      input.push({ type: "function_call_output", call_id: m.tool_call_id || "", output: m.content })
    }
  }
  return input
}

function getInstructions(msgs: ProviderRequest["messages"]): string {
  return msgs
    .filter((m) => m.role === "system" || m.role === "developer")
    .map((m) => m.content)
    .join("\n\n")
}

export function createOpenAIResponsesClient(options: {
  baseUrl?: string
  apiKey: string
  stream?: boolean
}): LLMClient {
  const openai = new OpenAI({ baseURL: options.baseUrl, apiKey: options.apiKey })

  return {
    async complete(request) {
      const params: any = {
        model: request.model,
        input: [{ instructions: getInstructions(request.messages), input: toResponsesInput(request.messages) }],
      }
      if (request.tools) {
        params.tools = request.tools.map((t) => ({
          type: "function", name: t.function.name, description: t.function.description,
          parameters: t.function.parameters,
        }))
      }
      if (request.max_tokens) params.max_output_tokens = request.max_tokens
      if (request.temperature != null) params.temperature = request.temperature
      if ((request as any).previous_response_id) params.previous_response_id = (request as any).previous_response_id

      const response = await openai.responses.create({ ...params, stream: false } as any)
      const output = (response as any).output || []
      let content = ""
      const toolCalls = new Map<number, { id: string; name: string; args: string }>()
      for (const item of output) {
        if (item.type === "message") {
          for (const c of item.content || []) {
            if (c.type === "output_text") content += c.text
          }
        } else if (item.type === "function_call") {
          const i = toolCalls.size
          toolCalls.set(i, { id: item.id || "", name: item.name, args: item.arguments || "" })
        }
      }
      const calls = Array.from(toolCalls.values()).map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.args }))
      return { content, toolCalls: calls.length ? calls : undefined, finishReason: "stop" }
    },
  }
}
