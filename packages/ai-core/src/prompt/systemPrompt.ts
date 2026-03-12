import { coerceContentToText } from "../providers/utils"

export function injectSystemPromptAsUserMessage<
  T extends { role?: string; content?: unknown },
>(messages: T[] = [], enabled = false): T[] {
  if (!enabled || !Array.isArray(messages) || messages.length === 0) {
    return messages
  }

  const systemParts: string[] = []
  const remaining: T[] = []

  messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content).trim()
      if (text) systemParts.push(text)
      return
    }
    remaining.push(message)
  })

  if (!systemParts.length) {
    return messages
  }

  const injected = {
    role: "user",
    content: systemParts.join("\n\n"),
  } as T

  return [injected, ...remaining]
}
