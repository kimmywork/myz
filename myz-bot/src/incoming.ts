import { mkdirSync, writeFileSync } from "node:fs"
import { extname, resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import type { BotRuntimeConfig } from "./config"
import type {
  TelegramClient,
  TelegramDocument,
  TelegramMessage,
  TelegramPhotoSize,
  TelegramVoice,
} from "./telegram"
import { resolveConversationRoute } from "./routing"

const INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024

function sanitizeFileSegment(value: string) {
  return value
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function sanitizeExtension(value: string) {
  if (!value) return ""
  const normalized = value.startsWith(".") ? value : `.${value}`
  const safe = normalized.replace(/[^\p{L}\p{N}.-]+/gu, "").toLowerCase()
  if (safe === ".") return ""
  return safe
}

function buildAttachmentFileName(options: {
  baseName: string
  filePath: string
  fallbackExt: string
  fallbackStem: string
}) {
  const rawBaseName = (options.baseName || "").trim()
  const originalExt = sanitizeExtension(extname(rawBaseName))
  const stemSource =
    originalExt && rawBaseName.endsWith(originalExt)
      ? rawBaseName.slice(0, -originalExt.length)
      : rawBaseName
  const stem =
    sanitizeFileSegment(stemSource) ||
    sanitizeFileSegment(options.fallbackStem) ||
    "attachment"
  const pathExt = sanitizeExtension(extname(options.filePath))
  const fallbackExt = sanitizeExtension(options.fallbackExt) || ".bin"
  const finalExt = originalExt || pathExt || fallbackExt
  return `${Date.now()}-${stem}${finalExt}`
}

function buildForwardLabel(message: TelegramMessage) {
  if (message.forward_from?.username) {
    return `@${message.forward_from.username}`
  }
  const origin = message.forward_origin
  if (!origin || typeof origin !== "object") return ""
  if (origin.type === "user" && origin.sender_user_name) {
    return origin.sender_user_name
  }
  if (origin.type === "chat" && origin.chat?.title) {
    return origin.chat.title
  }
  if (origin.type === "channel" && origin.chat?.title) {
    return origin.chat.title
  }
  return ""
}

function summarizeReferencedMessage(message?: TelegramMessage) {
  if (!message) return ""
  const speaker =
    message.from?.username
      ? `@${message.from.username}`
      : typeof message.from?.id === "number"
        ? `user:${message.from.id}`
        : ""
  const preview =
    message.text ||
    message.caption ||
    (Array.isArray(message.photo) && message.photo.length
      ? "[图片]"
      : message.document
        ? "[文件]"
        : message.voice
          ? "[语音]"
          : "")
  if (!preview) return ""
  return speaker
    ? `引用消息（${speaker}）：${preview.slice(0, 120)}`
    : `引用消息：${preview.slice(0, 120)}`
}

function ensureAttachmentDir(conversationDir: string) {
  const dir = resolve(conversationDir, "attachments")
  mkdirSync(dir, { recursive: true })
  return dir
}

function getExtensionFromPath(filePath: string, fallback: string) {
  const ext = extname(filePath)
  return ext || fallback
}

async function saveAttachment(options: {
  conversationDir: string
  conversationId: string
  telegram: TelegramClient
  fileId: string
  baseName: string
  fallbackExt: string
  fallbackStem: string
  mimeType?: string
  attachmentType: "photo" | "document" | "voice"
}) {
  const file = await options.telegram.getFile(options.fileId)
  if (!file.file_path) {
    throw new Error(`Telegram file path missing for ${options.fileId}`)
  }
  const buffer = Buffer.from(await options.telegram.downloadFile(file.file_path))
  const fileName = buildAttachmentFileName({
    baseName: options.baseName,
    filePath: file.file_path,
    fallbackExt: getExtensionFromPath(file.file_path, options.fallbackExt),
    fallbackStem: options.fallbackStem,
  })
  const dir = ensureAttachmentDir(options.conversationDir)
  const path = resolve(dir, fileName)
  const virtualPath = `/attachments/${fileName}`
  writeFileSync(path, buffer)

  const isImage =
    options.attachmentType === "photo" ||
    (options.mimeType || "").startsWith("image/")

  const inlineImage =
    isImage && buffer.byteLength <= INLINE_IMAGE_MAX_BYTES
      ? {
          type: "image" as const,
          dataUrl: `data:${options.mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`,
          mimeType: options.mimeType || "image/jpeg",
          name: fileName,
        }
      : null

  return {
    path,
    virtualPath,
    fileName,
    size: buffer.byteLength,
    inlineImage,
  }
}

function getBestPhoto(photo: TelegramPhotoSize[] = []) {
  return [...photo].sort((left, right) => (right.file_size || 0) - (left.file_size || 0))[0]
}

async function savePhoto(
  telegram: TelegramClient,
  message: TelegramMessage,
  conversationDir: string,
) {
  const photo = getBestPhoto(message.photo)
  if (!photo?.file_id) return null
  return saveAttachment({
    conversationDir,
    conversationId: resolveConversationRoute(message).conversationId,
    telegram,
    fileId: photo.file_id,
    baseName: `photo-${message.message_id}`,
    fallbackExt: ".jpg",
    fallbackStem: `photo-${message.message_id}`,
    mimeType: "image/jpeg",
    attachmentType: "photo",
  })
}

async function saveDocument(
  telegram: TelegramClient,
  document: TelegramDocument,
  message: TelegramMessage,
  conversationDir: string,
) {
  return saveAttachment({
    conversationDir,
    conversationId: resolveConversationRoute(message).conversationId,
    telegram,
    fileId: document.file_id,
    baseName: document.file_name || `document-${message.message_id}`,
    fallbackExt: ".bin",
    fallbackStem: `document-${message.message_id}`,
    mimeType: document.mime_type,
    attachmentType: "document",
  })
}

async function saveVoice(
  telegram: TelegramClient,
  voice: TelegramVoice,
  message: TelegramMessage,
  conversationDir: string,
) {
  return saveAttachment({
    conversationDir,
    conversationId: resolveConversationRoute(message).conversationId,
    telegram,
    fileId: voice.file_id,
    baseName: `voice-${message.message_id}`,
    fallbackExt: ".ogg",
    fallbackStem: `voice-${message.message_id}`,
    mimeType: voice.mime_type || "audio/ogg",
    attachmentType: "voice",
  })
}

export async function buildIncomingMessage(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
  message: TelegramMessage
  conversationDir: string
}): Promise<{ content: string; metadata: Message["metadata"] }> {
  const { config, telegram, message, conversationDir } = options
  const route = resolveConversationRoute(message)
  const contentSections: string[] = []
  const metadata: Message["metadata"] = {
    telegramMessageId: message.message_id,
    chatId: message.chat.id,
    chatType: message.chat.type,
    actorUserId: route.actorUserId,
    actorDisplayName: route.actorDisplayName,
  }

  if (typeof message.message_thread_id === "number") {
    metadata.messageThreadId = message.message_thread_id
  }

  if (route.scope === "group") {
    contentSections.push(`群消息发送者：${route.actorDisplayName}`)
  }

  const forwardedFrom = buildForwardLabel(message)
  if (forwardedFrom) {
    contentSections.push(`转发来源：${forwardedFrom}`)
  }

  const replySummary = summarizeReferencedMessage(message.reply_to_message)
  if (replySummary) {
    contentSections.push(replySummary)
  }

  const text = [message.text, message.caption]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim()
  if (text) {
    contentSections.push(text)
  }

  const attachmentSummaries: string[] = []
  const inlineImages: NonNullable<Message["metadata"]>["attachments"] = []
  const storedAttachments: Array<Record<string, unknown>> = []

  if (config.telegram.saveIncomingMedia) {
    if (Array.isArray(message.photo) && message.photo.length) {
      const saved = await savePhoto(telegram, message, conversationDir)
      if (saved) {
        attachmentSummaries.push(`图片已保存：${saved.virtualPath}`)
        storedAttachments.push({
          type: "photo",
          fileName: saved.fileName,
          path: saved.path,
          virtualPath: saved.virtualPath,
          size: saved.size,
        })
        if (saved.inlineImage) {
          inlineImages.push(saved.inlineImage)
        }
      }
    }

    if (message.document?.file_id) {
      const saved = await saveDocument(
        telegram,
        message.document,
        message,
        conversationDir,
      )
      attachmentSummaries.push(`文件已保存：${saved.virtualPath}`)
      storedAttachments.push({
        type: "document",
        fileName: saved.fileName,
        path: saved.path,
        virtualPath: saved.virtualPath,
        size: saved.size,
        mimeType: message.document.mime_type,
      })
      if (saved.inlineImage) {
        inlineImages.push(saved.inlineImage)
      }
    }

    if (message.voice?.file_id) {
      const saved = await saveVoice(telegram, message.voice, message, conversationDir)
      attachmentSummaries.push(`语音已保存：${saved.virtualPath}`)
      storedAttachments.push({
        type: "voice",
        fileName: saved.fileName,
        path: saved.path,
        virtualPath: saved.virtualPath,
        size: saved.size,
        mimeType: message.voice.mime_type,
      })
    }
  }

  if (attachmentSummaries.length) {
    contentSections.push(attachmentSummaries.join("\n"))
  }

  if (!contentSections.length) {
    contentSections.push("收到一条无文本消息，请结合附件和上下文理解用户意图。")
  }

  if (inlineImages.length) {
    metadata.attachments = inlineImages
  }
  if (storedAttachments.length) {
    metadata.telegramAttachments = storedAttachments
  }
  if (message.forward_from?.id) {
    metadata.forwardedFromUserId = message.forward_from.id
  }

  return {
    content: contentSections.join("\n\n").trim(),
    metadata,
  }
}
