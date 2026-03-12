import type {
  ImageAttachment,
  Message,
  MessageContent,
  MessageInPayload,
  OpenAIMessageContentPart,
} from "../types"
import { PromptBuilder } from "./builder"
import { isRecord } from "@myz/shared/typeUtils"

function normalizeAttachments(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (isRecord(item) ? item : {}))
    .map((item) => ({
      type: "image" as const,
      dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : "",
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
    }))
    .filter((item) => item.dataUrl)
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function buildUserContent(
  message: Message,
  includeVision: boolean,
): MessageContent {
  const text = typeof message?.content === "string" ? message.content : ""
  const selectionContextText =
    typeof message.metadata?.selectionContextText === "string"
      ? message.metadata.selectionContextText.trim()
      : ""
  const rawSkillList = message.metadata?.skillList
  const skillList = Array.isArray(rawSkillList)
    ? rawSkillList
        .map((item) => (isRecord(item) ? item : {}))
        .map((item) => ({
          name: typeof item.name === "string" ? item.name.trim() : "",
          description:
            typeof item.description === "string"
              ? item.description.trim()
              : "",
        }))
        .filter((item) => item.name)
    : []
  const skillContext =
    typeof message.metadata?.skillContext === "string"
      ? message.metadata.skillContext.trim()
      : ""
  const skillBlock = skillList.length
    ? [
        "提示：可通过 Read 获取 skill 详情以使用该技能。",
        "<available_skills>",
        ...skillList.map((skill) =>
          [
            "  <skill>",
            `    <name>${escapeXml(skill.name)}</name>`,
            `    <description>${escapeXml(skill.description)}</description>`,
            `    <location>/skills/${escapeXml(skill.name)}/SKILL.md</location>`,
            "  </skill>",
          ].join("\n"),
        ),
        "</available_skills>",
      ].join("\n")
    : skillContext
      ? `技能说明:\n${skillContext}`
      : ""
  const baseText = [text, skillBlock].filter(Boolean).join("\n\n").trim()
  if (!includeVision) {
    const plain = selectionContextText
      ? `选中内容（上下文）:\n${selectionContextText}\n\n${baseText}`.trim()
      : baseText
    return plain
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
    if (baseText.trim()) {
      parts.push({ type: "text", text: baseText })
    }
    return parts.length ? parts : text
  }

  const parts: OpenAIMessageContentPart[] = []
  if (selectionContextText) {
    parts.push({
      type: "text",
      text: `选中内容（上下文）:\n${selectionContextText}`,
    })
  }
  if (baseText.trim()) {
    parts.push({ type: "text", text: baseText })
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
