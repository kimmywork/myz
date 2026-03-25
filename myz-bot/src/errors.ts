import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { isAdminUser } from "./permissions"
import type { BotRuntimeConfig } from "./config"
import type { TelegramUser } from "./telegram"

export interface LoggedError {
  name: string
  message: string
  stack?: string
  cause?: unknown
}

function serializeUnknown(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknown(item))
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serializeUnknown((value as Error & { cause?: unknown }).cause),
    }
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50)
    return Object.fromEntries(
      entries.map(([key, item]) => [key, serializeUnknown(item)]),
    )
  }
  return String(value)
}

export function normalizeError(error: unknown): LoggedError {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack,
      cause: serializeUnknown((error as Error & { cause?: unknown }).cause),
    }
  }
  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown error",
    cause: serializeUnknown(error),
  }
}

export function appendConversationErrorLog(options: {
  conversationDir: string
  conversationId: string
  phase: string
  error: unknown
  context?: Record<string, unknown>
}) {
  const logDir = resolve(options.conversationDir, "logs")
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  const logFile = resolve(logDir, "errors.jsonl")
  const normalized = normalizeError(options.error)
  appendFileSync(
    logFile,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      conversationId: options.conversationId,
      phase: options.phase,
      error: normalized,
      context: serializeUnknown(options.context || {}),
    }) + "\n",
  )
  return normalized
}

export function formatErrorReply(options: {
  config: BotRuntimeConfig
  user?: TelegramUser
  error: unknown
}) {
  const normalized = normalizeError(options.error)
  if (isAdminUser(options.config, options.user)) {
    return [
      `处理失败：${normalized.message}`,
      "",
      `Error: ${normalized.name}`,
      normalized.stack || "(no stack)",
    ].join("\n")
  }
  return "处理失败，请稍后重试。"
}
