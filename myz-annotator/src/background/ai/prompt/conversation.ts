import type {
  ImageAttachment,
  Message,
  MessageContent,
  MessageInPayload,
  OpenAIMessageContentPart,
} from "../types.js"
import { PromptBuilder } from "./builder.js"

function normalizeAttachments(value: any): ImageAttachment[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      type: "image" as const,
      dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
      mimeType: typeof item?.mimeType === "string" ? item.mimeType : undefined,
      name: typeof item?.name === "string" ? item.name : undefined,
    }))
    .filter((item) => item.dataUrl)
}

function buildUserContent(
  message: Message,
  includeVision: boolean,
): MessageContent {
  const text = typeof message?.content === "string" ? message.content : ""
  const selectionContextText =
    typeof (message as any)?.metadata?.selectionContextText === "string"
      ? String((message as any).metadata.selectionContextText).trim()
      : ""
  if (!includeVision) {
    return selectionContextText
      ? `选中内容（上下文）:\n${selectionContextText}\n\n${text}`.trim()
      : text
  }

  const attachments = normalizeAttachments(message?.metadata?.attachments)
  if (!attachments.length) {
    const parts: OpenAIMessageContentPart[] = []
    if (selectionContextText) {
      parts.push({
        type: "text",
        text: `选中内容（上下文）:\n${selectionContextText}`,
      })
    }
    if (text.trim()) {
      parts.push({ type: "text", text })
    }
    return parts.length ? parts : text
  }

  const parts: OpenAIMessageContentPart[] = []
  if (selectionContextText) {
    parts.push({ type: "text", text: `选中内容（上下文）:\n${selectionContextText}` })
  }
  if (text.trim()) {
    parts.push({ type: "text", text })
  }
  attachments.forEach((attachment) => {
    parts.push({
      type: "image_url",
      image_url: { url: attachment.dataUrl },
    })
  })

  return parts.length ? parts : text
}

function appendStoredMessage(
  builder: PromptBuilder,
  message: Message,
  options: { includeVision: boolean },
) {
  const content = typeof message?.content === "string" ? message.content : ""

  switch (message?.role) {
    case "system":
      builder.addSystem(content)
      return
    case "user":
      builder.addUser(buildUserContent(message, options.includeVision))
      return
    case "assistant":
      builder.addAssistant(content, message.tool_calls)
      return
    case "tool":
      if (message.tool_call_id) {
        builder.addTool(content, message.tool_call_id)
      } else {
        builder.addMessage({ role: "tool", content })
      }
      return
    default:
      builder.addMessage({ role: "user", content })
  }
}

export function buildConversationPromptMessages(
  messages: Message[] = [],
  options: { includeVision?: boolean } = {},
): MessageInPayload[] {
  const builder = new PromptBuilder()
  const includeVision = Boolean(options.includeVision)
  messages.forEach((message) =>
    appendStoredMessage(builder, message, { includeVision }),
  )
  return builder.build()
}
