import OpenAI from "openai"
import type { LLMClient, ProviderRequest, ProviderResponse } from "./types"
import type { CompatProfile } from "../settings"

function toOpenAIMessages(msgs: ProviderRequest["messages"]): any[] {
  return msgs.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.tool_call_id }
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function toOpenAITools(tools?: ProviderRequest["tools"]): any[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    type: "function",
    function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
  }))
}

function applyProfilePatch(request: ProviderRequest, profile: CompatProfile): void {
  if (profile === "qwen") {
    const extra = (request as any).enable_thinking === undefined ? {} : (request as any)
    ;(request as any).enable_thinking = true
  }
  if (profile === "deepseek" || profile === "moonshot" || profile === "glm") {
    if (!request.reasoning_effort) request.reasoning_effort = "high"
    ;(request as any).thinking = { type: "enabled" }
  }
}

async function consumeStream(stream: any, onDelta?: (delta: { content?: string; reasoning?: string }) => void): Promise<ProviderResponse> {
  let content = ""
  let reasoning = ""
  const toolCalls = new Map<number, { id: string; name: string; args: string }>()

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta
    if (!delta) continue
    if (delta.content) {
      content += delta.content
      onDelta?.({ content: delta.content })
    }
    if (delta.reasoning) {
      reasoning += delta.reasoning
      onDelta?.({ reasoning: delta.reasoning })
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0
        const e = toolCalls.get(i) || { id: "", name: "", args: "" }
        if (tc.id) e.id = tc.id
        if (tc.function?.name) e.name = tc.function.name
        if (tc.function?.arguments) e.args += tc.function.arguments
        toolCalls.set(i, e)
      }
    }
  }

  const calls = Array.from(toolCalls.values()).map((tc) => ({
    id: tc.id, name: tc.name, arguments: tc.args,
  }))

  return {
    content: content.trim(),
    toolCalls: calls.length ? calls : undefined,
    finishReason: "stop",
  }
}

export function createOpenAICompatibleClient(options: {
  baseUrl: string
  apiKey: string
  profile?: CompatProfile
  stream?: boolean
}): LLMClient {
  const openai = new OpenAI({ baseURL: options.baseUrl, apiKey: options.apiKey || "sk-placeholder" })
  const profile = options.profile || "custom"

  return {
    async complete(request) {
      const patched = { ...request }
      applyProfilePatch(patched, profile)

      const body: any = {
        model: patched.model,
        messages: toOpenAIMessages(patched.messages),
        stream: options.stream !== false,
      }
      if (patched.temperature != null) body.temperature = patched.temperature
      if (patched.max_tokens != null) body.max_tokens = patched.max_tokens
      if (patched.tools) body.tools = toOpenAITools(patched.tools)
      if (patched.tool_choice) body.tool_choice = patched.tool_choice
      if (patched.reasoning_effort) body.reasoning_effort = patched.reasoning_effort
      if ((patched as any).thinking) body.thinking = (patched as any).thinking
      if ((patched as any).enable_thinking !== undefined) body.enable_thinking = (patched as any).enable_thinking

      const stream = await openai.chat.completions.create({
        ...body,
        stream_options: { include_usage: true },
      })
      return consumeStream(stream, request.onStreamDelta)
    },
  }
}
