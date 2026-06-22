import { GoogleGenAI } from "@google/genai"
import type { LLMClient, ProviderRequest, ProviderResponse } from "./types"

function toGeminiContents(msgs: ProviderRequest["messages"]): { systemInstruction: string; contents: any[] } {
  const sys: string[] = []
  const contents: any[] = []
  for (const m of msgs) {
    if (m.role === "system" || m.role === "developer") { sys.push(m.content); continue }
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] })
    } else if (m.role === "assistant") {
      const parts: any[] = []
      if (m.content) parts.push({ text: m.content })
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          parts.push({ functionCall: { name: tc.function.name, args: safeJson(tc.function.arguments) } })
        }
      }
      contents.push({ role: "model", parts })
    } else if (m.role === "tool") {
      contents.push({ role: "user", parts: [{ functionResponse: { name: "", response: { result: m.content } } }] })
    }
  }
  return { systemInstruction: sys.join("\n\n"), contents }
}

function safeJson(s: string): any { try { return JSON.parse(s) } catch { return s } }

export function createGeminiClient(options: { apiKey: string; stream?: boolean }): LLMClient {
  const genai = new GoogleGenAI({ apiKey: options.apiKey })

  return {
    async complete(request) {
      const { systemInstruction, contents } = toGeminiContents(request.messages)
      const config: any = {}
      if (systemInstruction) config.systemInstruction = systemInstruction
      if (request.tools) {
        config.tools = [{ functionDeclarations: request.tools.map((t) => ({
          name: t.function.name, description: t.function.description, parameters: t.function.parameters,
        })) }]
      }
      if (request.temperature != null) config.temperature = request.temperature
      if (request.max_tokens) config.maxOutputTokens = request.max_tokens

      const stream = await genai.models.generateContentStream({ model: request.model, contents, config })
      let content = ""
      const toolCalls = new Map<number, { name: string; args: any }>()

      for await (const chunk of stream) {
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          if (part.text) content += part.text
          if (part.functionCall) toolCalls.set(toolCalls.size, { name: part.functionCall.name || "", args: part.functionCall.args })
        }
      }

      const calls = Array.from(toolCalls.values()).map((tc, i) => ({
        id: `gemini-${i}`, name: tc.name, arguments: JSON.stringify(tc.args || {}),
      }))
      return { content, toolCalls: calls.length ? calls : undefined, finishReason: "stop" }
    },
  }
}
