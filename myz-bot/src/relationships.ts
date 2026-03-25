import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import type { ConversationMetadata } from "./conversations"
import { createSystemMessage, createUserMessage } from "./conversations"

export type RelationshipMessagingPolicy = "allowed" | "cautious" | "blocked"

export interface RelationshipRecord {
  key: string
  actorUserId?: number
  conversationIds: string[]
  privateConversationId?: string
  privateChatId?: number
  usernames: string[]
  displayNames: string[]
  firstNames: string[]
  lastNames: string[]
  aliases: string[]
  relationshipSummary: string
  impressionSummary: string
  messagingPolicy: RelationshipMessagingPolicy
  createdAt: string
  updatedAt: string
  lastReflectedAt?: string
}

export interface KnownContact {
  key: string
  actorUserId?: number
  conversationId?: string
  chatId?: number
  username?: string
  displayName: string
  aliases: string[]
  relationshipSummary?: string
  impressionSummary?: string
  messagingPolicy: RelationshipMessagingPolicy
}

type RelationshipReflectionResult = {
  shouldUpdate?: boolean
  relationshipSummary?: string
  impressionSummary?: string
  aliases?: string[]
  messagingPolicy?: RelationshipMessagingPolicy | "neutral"
}

const RELATIONSHIP_SCHEMA_VERSION = "1.0.0"
const RELATIONSHIP_SUMMARY_MAX_CHARS = 320
const MAX_RELATIONSHIP_EVENT_LOG_LINES = 200

interface RelationshipReflectionAuditEvent {
  timestamp: string
  key: string
  conversationId?: string
  actorUserId?: number
  relationshipSummary: string
  impressionSummary: string
  aliases: string[]
  messagingPolicy: RelationshipMessagingPolicy
}

function getRelationshipPaths(workspaceRoot: string) {
  const dir = resolve(workspaceRoot, "relationships")
  return {
    dir,
    indexFile: resolve(dir, "index.json"),
    reflectionFile: resolve(dir, "reflections.jsonl"),
    archiveDir: resolve(dir, "archive"),
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeIdentity(value: string) {
  return normalizeText(value).replace(/^@/, "").toLowerCase()
}

function normalizeAliasList(values: string[] = []) {
  const next = new Set(
    values
      .map((value) => normalizeText(value))
      .filter(Boolean),
  )
  return Array.from(next)
}

function snippet(value: string, maxLength = 160) {
  const text = normalizeText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function compactSummary(value: string, maxChars = RELATIONSHIP_SUMMARY_MAX_CHARS) {
  const text = normalizeText(value)
  if (!text) return ""
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(40, maxChars - 8)).trim()}...`
}

function normalizeJsonBlock(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  return trimmed
}

function buildRelationshipKey(options: {
  actorUserId?: number
  username?: string
  conversationId?: string
}) {
  if (typeof options.actorUserId === "number" && Number.isFinite(options.actorUserId)) {
    return `user:${options.actorUserId}`
  }
  if (options.username && normalizeIdentity(options.username)) {
    return `username:${normalizeIdentity(options.username)}`
  }
  return `conversation:${options.conversationId || "unknown"}`
}

function buildRelationshipAnalysisPrompt() {
  return [
    "你是一个关系状态反思器。",
    "任务：根据最近一批 bot 与某个对象的对话，更新 bot 对这个人的关系判断、整体印象，以及是否适合主动发送消息。",
    "",
    "只输出 JSON，不要输出解释，不要输出 Markdown。",
    "JSON schema:",
    "{",
    '  "shouldUpdate": boolean,',
    '  "relationshipSummary": string,',
    '  "impressionSummary": string,',
    '  "aliases": string[],',
    '  "messagingPolicy": "allowed" | "cautious" | "blocked" | "neutral"',
    "}",
    "",
    "规则：",
    "- relationshipSummary 应描述 bot 眼中的关系状态，例如熟悉程度、互动边界、合作方式。",
    "- impressionSummary 应描述 bot 对这个人的稳定印象，例如偏好、气质、沟通习惯。",
    "- aliases 只保留稳定称呼或明确提到的昵称，不要猜。",
    "- messagingPolicy:",
    "  - allowed: 主动通知或转告通常是合适的",
    "  - cautious: 只有在明确请求、任务需要、或上下文很清楚时才适合联系",
    "  - blocked: 不适合主动打扰、联系或代为传话",
    "- 如果本批对话没有形成新的稳定认识，shouldUpdate 为 false。",
  ].join("\n")
}

function buildRelationshipTranscript(messages: Message[]) {
  return messages
    .map((message) => `${message.role}: ${snippet(typeof message.content === "string" ? message.content : "", 220)}`)
    .join("\n\n")
}

function parseRelationshipReflectionResponse(content: string) {
  const parsed = JSON.parse(normalizeJsonBlock(content)) as RelationshipReflectionResult
  const aliases = Array.isArray(parsed.aliases)
    ? normalizeAliasList(parsed.aliases.map((alias) => String(alias)))
    : []
  const messagingPolicy: RelationshipMessagingPolicy =
    parsed.messagingPolicy === "allowed" ||
    parsed.messagingPolicy === "blocked" ||
    parsed.messagingPolicy === "cautious"
      ? parsed.messagingPolicy
      : "cautious"
  return {
    shouldUpdate: parsed.shouldUpdate === true,
    relationshipSummary:
      typeof parsed.relationshipSummary === "string"
        ? normalizeText(parsed.relationshipSummary)
        : "",
    impressionSummary:
      typeof parsed.impressionSummary === "string"
        ? normalizeText(parsed.impressionSummary)
        : "",
    aliases,
    messagingPolicy,
  }
}

export function ensureRelationshipsRuntime(workspaceRoot: string) {
  const paths = getRelationshipPaths(workspaceRoot)
  mkdirSync(paths.dir, { recursive: true })
  mkdirSync(paths.archiveDir, { recursive: true })
  if (!existsSync(paths.indexFile)) {
    writeFileSync(
      paths.indexFile,
      JSON.stringify({ schemaVersion: RELATIONSHIP_SCHEMA_VERSION, records: [] }, null, 2),
    )
  }
  if (!existsSync(paths.reflectionFile)) {
    writeFileSync(paths.reflectionFile, "")
  }
  return paths
}

export function loadRelationshipRecords(workspaceRoot: string): RelationshipRecord[] {
  const paths = ensureRelationshipsRuntime(workspaceRoot)
  try {
    const parsed = JSON.parse(readFileSync(paths.indexFile, "utf-8")) as {
      records?: RelationshipRecord[]
    }
    return Array.isArray(parsed.records) ? parsed.records : []
  } catch {
    return []
  }
}

function saveRelationshipRecords(workspaceRoot: string, records: RelationshipRecord[]) {
  const paths = ensureRelationshipsRuntime(workspaceRoot)
  writeFileSync(
    paths.indexFile,
    JSON.stringify(
      {
        schemaVersion: RELATIONSHIP_SCHEMA_VERSION,
        records,
      },
      null,
      2,
    ),
  )
}

function appendRelationshipReflectionEvent(
  workspaceRoot: string,
  event: RelationshipReflectionAuditEvent,
) {
  const paths = ensureRelationshipsRuntime(workspaceRoot)
  appendFileSync(paths.reflectionFile, JSON.stringify(event) + "\n")
  compactRelationshipReflectionLog(workspaceRoot)
}

function compactRelationshipReflectionLog(workspaceRoot: string) {
  const paths = ensureRelationshipsRuntime(workspaceRoot)
  const raw = readFileSync(paths.reflectionFile, "utf-8")
  const lines = raw
    .split(/\r?\n/)
    .filter(Boolean)
  if (lines.length <= MAX_RELATIONSHIP_EVENT_LOG_LINES) return

  const archiveLines = lines.slice(0, lines.length - MAX_RELATIONSHIP_EVENT_LOG_LINES)
  const keptLines = lines.slice(-MAX_RELATIONSHIP_EVENT_LOG_LINES)
  const archivePath = resolve(
    paths.archiveDir,
    `relationship-reflections-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
  )
  writeFileSync(archivePath, `${archiveLines.join("\n")}\n`)
  writeFileSync(paths.reflectionFile, `${keptLines.join("\n")}\n`)
}

export function upsertRelationshipRecord(options: {
  workspaceRoot: string
  actorUserId?: number
  conversationId?: string
  privateConversationId?: string
  privateChatId?: number
  username?: string
  firstName?: string
  lastName?: string
  displayName?: string
  aliases?: string[]
  relationshipSummary?: string
  impressionSummary?: string
  messagingPolicy?: RelationshipMessagingPolicy
  reflected?: boolean
}) {
  const key = buildRelationshipKey(options)
  const records = loadRelationshipRecords(options.workspaceRoot)
  const now = new Date().toISOString()
  const existing = records.find((record) => record.key === key)
  const next: RelationshipRecord = existing
    ? {
        ...existing,
        actorUserId:
          typeof options.actorUserId === "number" ? options.actorUserId : existing.actorUserId,
        conversationIds: Array.from(
          new Set([
            ...existing.conversationIds,
            ...(options.conversationId ? [options.conversationId] : []),
          ]),
        ),
        privateConversationId: options.privateConversationId || existing.privateConversationId,
        privateChatId:
          typeof options.privateChatId === "number"
            ? options.privateChatId
            : existing.privateChatId,
        usernames: normalizeAliasList([
          ...existing.usernames,
          ...(options.username ? [options.username] : []),
        ]),
        displayNames: normalizeAliasList([
          ...existing.displayNames,
          ...(options.displayName ? [options.displayName] : []),
        ]),
        firstNames: normalizeAliasList([
          ...existing.firstNames,
          ...(options.firstName ? [options.firstName] : []),
        ]),
        lastNames: normalizeAliasList([
          ...existing.lastNames,
          ...(options.lastName ? [options.lastName] : []),
        ]),
        aliases: normalizeAliasList([
          ...existing.aliases,
          ...(options.aliases || []),
        ]),
        relationshipSummary:
          typeof options.relationshipSummary === "string" && options.relationshipSummary.trim()
            ? compactSummary(options.relationshipSummary)
            : existing.relationshipSummary,
        impressionSummary:
          typeof options.impressionSummary === "string" && options.impressionSummary.trim()
            ? compactSummary(options.impressionSummary)
            : existing.impressionSummary,
        messagingPolicy: options.messagingPolicy || existing.messagingPolicy,
        updatedAt: now,
        lastReflectedAt: options.reflected ? now : existing.lastReflectedAt,
      }
    : {
        key,
        actorUserId: options.actorUserId,
        conversationIds: options.conversationId ? [options.conversationId] : [],
        privateConversationId: options.privateConversationId,
        privateChatId: options.privateChatId,
        usernames: normalizeAliasList(options.username ? [options.username] : []),
        displayNames: normalizeAliasList(options.displayName ? [options.displayName] : []),
        firstNames: normalizeAliasList(options.firstName ? [options.firstName] : []),
        lastNames: normalizeAliasList(options.lastName ? [options.lastName] : []),
        aliases: normalizeAliasList(options.aliases || []),
        relationshipSummary: compactSummary(options.relationshipSummary || ""),
        impressionSummary: compactSummary(options.impressionSummary || ""),
        messagingPolicy: options.messagingPolicy || "cautious",
        createdAt: now,
        updatedAt: now,
        lastReflectedAt: options.reflected ? now : undefined,
      }
  const nextRecords = existing
    ? records.map((record) => (record.key === key ? next : record))
    : [next, ...records]
  saveRelationshipRecords(options.workspaceRoot, nextRecords)
  if (options.reflected) {
    appendRelationshipReflectionEvent(options.workspaceRoot, {
      timestamp: now,
      key: next.key,
      conversationId: options.conversationId,
      actorUserId: next.actorUserId,
      relationshipSummary: next.relationshipSummary,
      impressionSummary: next.impressionSummary,
      aliases: next.aliases,
      messagingPolicy: next.messagingPolicy,
    })
  }
  return next
}

export function touchRelationshipRecord(options: {
  workspaceRoot: string
  conversationId: string
  scope: "private" | "group"
  chatId?: number
  actorUserId?: number
  username?: string
  firstName?: string
  lastName?: string
  displayName?: string
}) {
  return upsertRelationshipRecord({
    workspaceRoot: options.workspaceRoot,
    actorUserId: options.actorUserId,
    conversationId: options.conversationId,
    privateConversationId: options.scope === "private" ? options.conversationId : undefined,
    privateChatId: options.scope === "private" ? options.chatId : undefined,
    username: options.username,
    firstName: options.firstName,
    lastName: options.lastName,
    displayName: options.displayName,
  })
}

function resolveCurrentRelationshipRecord(options: {
  workspaceRoot: string
  actorUserId?: number
  username?: string
}) {
  const records = loadRelationshipRecords(options.workspaceRoot)
  const normalizedUsername = options.username ? normalizeIdentity(options.username) : ""
  return records.find((record) => {
    if (typeof options.actorUserId === "number" && record.actorUserId === options.actorUserId) {
      return true
    }
    return normalizedUsername
      ? record.usernames.some((username) => normalizeIdentity(username) === normalizedUsername)
      : false
  })
}

export function renderRelationshipContext(options: {
  workspaceRoot: string
  actorUserId?: number
  username?: string
}) {
  const record = resolveCurrentRelationshipRecord(options)
  if (!record) return ""
  const policyText =
    record.messagingPolicy === "allowed"
      ? "通常可以主动通知或转告"
      : record.messagingPolicy === "blocked"
        ? "不适合主动打扰或代为传话"
        : "联系他人时需要谨慎，只在明确请求或上下文很清楚时进行"
  return [
    "当前关系记录：",
    record.relationshipSummary
      ? `- 关系状态：${record.relationshipSummary}`
      : "",
    record.impressionSummary
      ? `- 当前印象：${record.impressionSummary}`
      : "",
    record.aliases.length
      ? `- 稳定称呼：${record.aliases.join(" / ")}`
      : "",
    `- 主动联系边界：${policyText}`,
  ]
    .filter(Boolean)
    .join("\n")
}

function loadPrivateConversationMetadata(conversationsDir: string) {
  const records: ConversationMetadata[] = []
  if (!existsSync(conversationsDir)) return records
  for (const name of readdirSync(conversationsDir)) {
    const metadataFile = resolve(conversationsDir, name, "metadata.json")
    if (!existsSync(metadataFile)) continue
    try {
      const metadata = JSON.parse(readFileSync(metadataFile, "utf-8")) as ConversationMetadata
      const isPrivate =
        metadata.scope === "private" || metadata.chatType === "private"
      if (isPrivate) {
        records.push(metadata)
      }
    } catch {
      continue
    }
  }
  return records
}

export function listKnownContacts(options: {
  workspaceRoot: string
  conversationsDir: string
}) {
  const relationshipRecords = loadRelationshipRecords(options.workspaceRoot)
  const metadataEntries = loadPrivateConversationMetadata(options.conversationsDir)
  const byKey = new Map<string, KnownContact>()

  metadataEntries.forEach((metadata) => {
    const key = buildRelationshipKey({
      actorUserId: metadata.userId,
      username: metadata.username,
      conversationId: metadata.conversationId,
    })
    const displayName =
      [metadata.firstName, metadata.lastName].filter(Boolean).join(" ").trim() ||
      metadata.username ||
      metadata.lastActorDisplayName ||
      metadata.conversationId
    byKey.set(key, {
      key,
      actorUserId: metadata.userId,
      conversationId: metadata.conversationId,
      chatId: metadata.chatId,
      username: metadata.username,
      displayName,
      aliases: normalizeAliasList([
        metadata.username || "",
        metadata.firstName || "",
        metadata.lastName || "",
        metadata.lastActorDisplayName || "",
      ]),
      messagingPolicy: "cautious",
    })
  })

  relationshipRecords.forEach((record) => {
    const target =
      byKey.get(record.key) ||
      (record.privateConversationId && record.privateChatId
        ? {
            key: record.key,
            actorUserId: record.actorUserId,
            conversationId: record.privateConversationId,
            chatId: record.privateChatId,
            username: record.usernames[0],
            displayName: record.displayNames[0] || record.usernames[0] || record.key,
            aliases: [],
            messagingPolicy: record.messagingPolicy,
          }
        : null)
    if (!target) return
    target.aliases = normalizeAliasList([
      ...target.aliases,
      ...record.aliases,
      ...record.usernames,
      ...record.displayNames,
      ...record.firstNames,
      ...record.lastNames,
    ])
    target.relationshipSummary = record.relationshipSummary || target.relationshipSummary
    target.impressionSummary = record.impressionSummary || target.impressionSummary
    target.messagingPolicy = record.messagingPolicy || target.messagingPolicy
    byKey.set(record.key, target)
  })

  return Array.from(byKey.values())
    .filter((contact) => typeof contact.chatId === "number" && Boolean(contact.conversationId))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function resolveKnownContact(options: {
  workspaceRoot: string
  conversationsDir: string
  target: string
}) {
  const normalizedTarget = normalizeIdentity(options.target)
  if (!normalizedTarget) return null
  const contacts = listKnownContacts({
    workspaceRoot: options.workspaceRoot,
    conversationsDir: options.conversationsDir,
  })
  const matches = contacts.filter((contact) => {
    if (typeof contact.actorUserId === "number" && String(contact.actorUserId) === normalizedTarget) {
      return true
    }
    if (contact.conversationId && normalizeIdentity(contact.conversationId) === normalizedTarget) {
      return true
    }
    if (contact.username && normalizeIdentity(contact.username) === normalizedTarget) {
      return true
    }
    return contact.aliases.some((alias) => normalizeIdentity(alias) === normalizedTarget)
  })
  if (matches.length !== 1) return null
  return matches[0]
}

export async function reflectRelationshipRecord(options: {
  config: BotRuntimeConfig
  workspaceRoot: string
  conversationsDir: string
  conversationId: string
  actorUserId?: number
  chatId?: number
  username?: string
  firstName?: string
  lastName?: string
  displayName?: string
  scope: "private" | "group"
  messages: Message[]
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}) {
  touchRelationshipRecord({
    workspaceRoot: options.workspaceRoot,
    conversationId: options.conversationId,
    scope: options.scope,
    chatId: options.chatId,
    actorUserId: options.actorUserId,
    username: options.username,
    firstName: options.firstName,
    lastName: options.lastName,
    displayName: options.displayName,
  })

  const existing = resolveCurrentRelationshipRecord({
    workspaceRoot: options.workspaceRoot,
    actorUserId: options.actorUserId,
    username: options.username,
  })

  const analysisConfig: BotRuntimeConfig = {
    ...options.config,
    ai: {
      ...options.config.ai,
      capabilities: {
        ...options.config.ai.capabilities,
        toolCalling: false,
        reasoning: false,
      },
      limits: {
        ...options.config.ai.limits,
        maxOutputTokens: Math.min(options.config.ai.limits.maxOutputTokens, 500),
      },
    },
  }
  const messages = [
    createSystemMessage(
      options.conversationId,
      buildRelationshipAnalysisPrompt(),
    ),
    createUserMessage(
      options.conversationId,
      [
        "当前对象：",
        snippet(options.displayName || options.username || String(options.actorUserId || "unknown"), 120),
        "",
        "已有关系记录：",
        existing?.relationshipSummary || "(none)",
        "",
        "已有印象记录：",
        existing?.impressionSummary || "(none)",
        "",
        "最近对话批次：",
        buildRelationshipTranscript(options.messages),
      ].join("\n"),
    ),
  ]
  const completion = options.createCompletion
    ? await options.createCompletion(messages)
    : (await generateReply({
        config: analysisConfig,
        messages,
        conversationId: options.conversationId,
        temperature: 0.1,
      })).content

  const reflection = parseRelationshipReflectionResponse(completion)
  if (!reflection.shouldUpdate) {
    return existing || null
  }

  return upsertRelationshipRecord({
    workspaceRoot: options.workspaceRoot,
    actorUserId: options.actorUserId,
    conversationId: options.conversationId,
    privateConversationId: options.scope === "private" ? options.conversationId : undefined,
    privateChatId: options.scope === "private" ? options.chatId : undefined,
    username: options.username,
    firstName: options.firstName,
    lastName: options.lastName,
    displayName: options.displayName,
    aliases: reflection.aliases,
    relationshipSummary: reflection.relationshipSummary,
    impressionSummary: reflection.impressionSummary,
    messagingPolicy: reflection.messagingPolicy,
    reflected: true,
  })
}
