import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { generateReply } from "./ai"
import { updateChatChronicle } from "./chatChronicle"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage } from "./conversations"
import { recordSoulGrowthFeedback } from "./growth"
import { reflectRelationshipRecord } from "./relationships"
import {
  applySoulDraft,
  createSoulDraft,
  loadSoul,
  runExclusiveSoulMutation,
} from "./soul"
import { renderSoulGrowthContext } from "./growth"
import {
  loadTelegramHistory,
  type TelegramHistoryEntry,
} from "./telegramHistory"

type ReflectionTrigger = "count" | "time"

interface ReflectionCursorState {
  lastProcessedTelegramMessageId?: number
  lastProcessedAt?: string
  lastTrigger?: ReflectionTrigger
}

interface ConversationReflectionState {
  schemaVersion: string
  autoDraft: ReflectionCursorState
  growth: ReflectionCursorState
  relationship: ReflectionCursorState
  chronicle: ReflectionCursorState
}

interface ReflectionBatchPlan {
  trigger: ReflectionTrigger | null
  pendingEntries: TelegramHistoryEntry[]
  nextProcessedTelegramMessageId?: number
}

export interface ConversationReflectionIdentity {
  actorUserId?: number
  chatId?: number
  username?: string
  firstName?: string
  lastName?: string
  displayName?: string
  scope: "private" | "group"
}

export interface ConversationReflectionResult {
  autoDraft: {
    triggered: boolean
    trigger?: ReflectionTrigger
    draftId?: string
    applied?: boolean
  }
  growth: {
    triggered: boolean
    trigger?: ReflectionTrigger
    recorded: boolean
  }
  relationship: {
    triggered: boolean
    trigger?: ReflectionTrigger
    updated: boolean
  }
  chronicle: {
    updated: boolean
  }
}

const SCHEMA_VERSION = "1.0.0"
const reflectionPassQueues = new Map<string, Promise<unknown>>()

function buildDefaultCursorState(): ReflectionCursorState {
  return {}
}

function getReflectionStatePath(conversationDir: string) {
  const contextDir = resolve(conversationDir, "context")
  return {
    contextDir,
    stateFile: resolve(contextDir, "reflections.json"),
  }
}

function ensureReflectionState(conversationDir: string) {
  const paths = getReflectionStatePath(conversationDir)
  mkdirSync(paths.contextDir, { recursive: true })
  if (!existsSync(paths.stateFile)) {
    writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
          autoDraft: buildDefaultCursorState(),
          growth: buildDefaultCursorState(),
          relationship: buildDefaultCursorState(),
          chronicle: buildDefaultCursorState(),
        } satisfies ConversationReflectionState,
        null,
        2,
      ),
    )
  }
  return paths
}

export function loadConversationReflectionState(conversationDir: string) {
  const paths = ensureReflectionState(conversationDir)
  try {
    const parsed = JSON.parse(readFileSync(paths.stateFile, "utf-8")) as Partial<ConversationReflectionState>
    return {
      schemaVersion: parsed.schemaVersion || SCHEMA_VERSION,
      autoDraft: {
        ...buildDefaultCursorState(),
        ...(parsed.autoDraft || {}),
      },
      growth: {
        ...buildDefaultCursorState(),
        ...(parsed.growth || {}),
      },
      relationship: {
        ...buildDefaultCursorState(),
        ...(parsed.relationship || {}),
      },
      chronicle: {
        ...buildDefaultCursorState(),
        ...(parsed.chronicle || {}),
      },
    } satisfies ConversationReflectionState
  } catch {
    return {
      schemaVersion: SCHEMA_VERSION,
      autoDraft: buildDefaultCursorState(),
      growth: buildDefaultCursorState(),
      relationship: buildDefaultCursorState(),
      chronicle: buildDefaultCursorState(),
    } satisfies ConversationReflectionState
  }
}

function saveConversationReflectionState(
  conversationDir: string,
  state: ConversationReflectionState,
) {
  const paths = ensureReflectionState(conversationDir)
  writeFileSync(paths.stateFile, JSON.stringify(state, null, 2))
}

function normalizeTelegramMessageId(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.floor(value))
}

function resolveReflectionBatchPlan(options: {
  entries: TelegramHistoryEntry[]
  lastProcessedTelegramMessageId?: number
  messageInterval: number
  timeIntervalMs: number
  now?: number
}) {
  const lastProcessedTelegramMessageId = normalizeTelegramMessageId(
    options.lastProcessedTelegramMessageId,
  )
  const reflectiveEntries = options.entries.filter(
    (entry) => entry.kind === "conversation" && entry.speaker !== undefined,
  )
  const pendingEntries = reflectiveEntries.filter((entry) =>
    typeof lastProcessedTelegramMessageId === "number"
      ? entry.telegramMessageId > lastProcessedTelegramMessageId
      : true,
  )
  if (!pendingEntries.length) {
    return {
      trigger: null,
      pendingEntries,
      nextProcessedTelegramMessageId: lastProcessedTelegramMessageId,
    } satisfies ReflectionBatchPlan
  }

  const safeMessageInterval = Math.max(1, Math.floor(options.messageInterval))
  const batchedPendingEntries = pendingEntries.slice(-safeMessageInterval)
  const nextProcessedTelegramMessageId = pendingEntries[pendingEntries.length - 1]?.telegramMessageId
  if (pendingEntries.length >= safeMessageInterval) {
    return {
      trigger: "count",
      pendingEntries: batchedPendingEntries,
      nextProcessedTelegramMessageId,
    } satisfies ReflectionBatchPlan
  }

  const safeTimeIntervalMs = Math.max(0, Math.floor(options.timeIntervalMs))
  const latestPendingTimestamp = pendingEntries[pendingEntries.length - 1]?.timestamp
  const latestPendingAt = latestPendingTimestamp ? Date.parse(latestPendingTimestamp) : Number.NaN
  const now = typeof options.now === "number" ? options.now : Date.now()
  if (
    safeTimeIntervalMs > 0 &&
    Number.isFinite(latestPendingAt) &&
    now - latestPendingAt >= safeTimeIntervalMs
  ) {
    return {
      trigger: "time",
      pendingEntries: batchedPendingEntries,
      nextProcessedTelegramMessageId,
    } satisfies ReflectionBatchPlan
  }

  return {
    trigger: null,
    pendingEntries,
    nextProcessedTelegramMessageId,
  } satisfies ReflectionBatchPlan
}

function convertTelegramEntriesToMessages(
  conversationId: string,
  entries: TelegramHistoryEntry[],
) {
  return entries.map((entry, index) => ({
    schemaVersion: "1.0.0",
    id: `tg-${entry.telegramMessageId}-${index + 1}`,
    conversationId,
    role: entry.speaker === "assistant" ? ("assistant" as const) : ("user" as const),
    content: entry.text,
    timestamp: entry.timestamp,
    metadata: {
      telegramMessageId: entry.telegramMessageId,
      source: "telegram-history",
      kind: entry.kind,
    },
  })) satisfies Message[]
}

export async function generateSoulDraftContent(options: {
  config: BotRuntimeConfig
  conversationId: string
  recentMessages: Message[]
  actor: string
}) {
  const soul = loadSoul(options.config.workspaceRoot)
  const roleGrowthContext = renderSoulGrowthContext(
    options.config.workspaceRuntimeRoot,
    soul,
  )
  const transcript = options.recentMessages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n")

  const draftConfig: BotRuntimeConfig = {
    ...options.config,
    ai: {
      ...options.config.ai,
      capabilities: {
        ...options.config.ai.capabilities,
        toolCalling: false,
      },
    },
  }

  const reply = await generateReply({
    config: draftConfig,
    conversationId: options.conversationId,
    messages: [
      createSystemMessage(
        options.conversationId,
        "你是 SOUL 设定编辑器。你必须输出完整的 Markdown 版 SOUL.md，不要输出解释。",
      ),
      createUserMessage(
        options.conversationId,
        [
          `当前操作者：${options.actor}`,
          "请基于当前 SOUL 和最近对话，生成一份新的 SOUL.md 草案。",
          "要求：保持拟人一致性；保留结构标题；不要加入工具、模型、系统实现细节；整体保持简洁，避免无限增长。",
          "只把已经稳定下来的长期结论吸收进 SOUL，不要把最近一轮反馈、成长流水、短期情绪结论直接写成长段落。",
          "不要输出“角色成长状态”或“最近反馈摘要”这类阶段性小结标题；这些内容会由独立成长层维护。",
          "边界要求：保持角色身份连续性与核心关系不变；允许依据长期反馈做渐进成长，但不允许人格突变。",
          "",
          "当前 SOUL：",
          soul.trim(),
          "",
          "角色成长状态：",
          roleGrowthContext,
          "",
          "最近对话：",
          transcript || "暂无最近对话",
        ].join("\n"),
      ),
    ],
  })

  return reply.content.trim() || soul
}

async function processConversationReflectionPassUnlocked(options: {
  config: BotRuntimeConfig
  conversationId: string
  conversationDir: string
  identity: ConversationReflectionIdentity
  actor: string
  now?: Date
  createGrowthCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createRelationshipCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createChronicleCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createDraftContent?: (payload: {
    config: BotRuntimeConfig
    conversationId: string
    recentMessages: Message[]
    actor: string
  }) => Promise<string>
}) {
  const state = loadConversationReflectionState(options.conversationDir)
  const now = options.now || new Date()
  const nowIso = now.toISOString()
  const telegramEntries = loadTelegramHistory(options.conversationDir)
  const result: ConversationReflectionResult = {
    autoDraft: {
      triggered: false,
    },
    growth: {
      triggered: false,
      recorded: false,
    },
    relationship: {
      triggered: false,
      updated: false,
    },
    chronicle: {
      updated: false,
    },
  }

  const growthPlan = resolveReflectionBatchPlan({
    entries: telegramEntries,
    lastProcessedTelegramMessageId: state.growth.lastProcessedTelegramMessageId,
    messageInterval: options.config.soul.growthFeedbackBatchMessageInterval,
    timeIntervalMs: options.config.soul.growthFeedbackTimeIntervalMs,
    now: now.getTime(),
  })
  if (growthPlan.trigger) {
    const event = await recordSoulGrowthFeedback({
      config: options.config,
      runtimeRoot: options.config.workspaceRuntimeRoot,
      soul: loadSoul(options.config.workspaceRoot),
      conversationId: options.conversationId,
      messages: convertTelegramEntriesToMessages(
        options.conversationId,
        growthPlan.pendingEntries,
      ),
      createCompletion: options.createGrowthCompletion,
    })
    state.growth = {
      lastProcessedTelegramMessageId: growthPlan.nextProcessedTelegramMessageId,
      lastProcessedAt: nowIso,
      lastTrigger: growthPlan.trigger,
    }
    saveConversationReflectionState(options.conversationDir, state)
    result.growth = {
      triggered: true,
      trigger: growthPlan.trigger,
      recorded: Boolean(event),
    }
  }

  const relationshipPlan = resolveReflectionBatchPlan({
    entries: telegramEntries,
    lastProcessedTelegramMessageId: state.relationship.lastProcessedTelegramMessageId,
    messageInterval: options.config.soul.relationshipReflectionMessageInterval,
    timeIntervalMs: options.config.soul.relationshipReflectionTimeIntervalMs,
    now: now.getTime(),
  })
  if (relationshipPlan.trigger) {
    const record = await reflectRelationshipRecord({
      config: options.config,
      workspaceRoot: options.config.workspaceRuntimeRoot,
      conversationsDir: options.config.conversationsDir,
      conversationId: options.conversationId,
      actorUserId: options.identity.actorUserId,
      chatId: options.identity.chatId,
      username: options.identity.username,
      firstName: options.identity.firstName,
      lastName: options.identity.lastName,
      displayName: options.identity.displayName,
      scope: options.identity.scope,
      messages: convertTelegramEntriesToMessages(
        options.conversationId,
        relationshipPlan.pendingEntries,
      ),
      createCompletion: options.createRelationshipCompletion,
    })
    state.relationship = {
      lastProcessedTelegramMessageId: relationshipPlan.nextProcessedTelegramMessageId,
      lastProcessedAt: nowIso,
      lastTrigger: relationshipPlan.trigger,
    }
    saveConversationReflectionState(options.conversationDir, state)
    result.relationship = {
      triggered: true,
      trigger: relationshipPlan.trigger,
      updated: Boolean(record),
    }
  }

  if (options.config.soul.autoDraft) {
    const draftPlan = resolveReflectionBatchPlan({
      entries: telegramEntries,
      lastProcessedTelegramMessageId: state.autoDraft.lastProcessedTelegramMessageId,
      messageInterval: options.config.soul.autoDraftMessageInterval,
      timeIntervalMs: options.config.soul.autoDraftTimeIntervalMs,
      now: now.getTime(),
    })
    if (draftPlan.trigger) {
      const draftMessages = convertTelegramEntriesToMessages(
        options.conversationId,
        draftPlan.pendingEntries,
      )
      const { draft, applied } = await runExclusiveSoulMutation(async () => {
        const content = options.createDraftContent
          ? await options.createDraftContent({
              config: options.config,
              conversationId: options.conversationId,
              recentMessages: draftMessages,
              actor: options.actor,
            })
          : await generateSoulDraftContent({
              config: options.config,
              conversationId: options.conversationId,
              recentMessages: draftMessages,
              actor: options.actor,
            })
        const nextDraft = createSoulDraft({
          runtimeRoot: options.config.workspaceRuntimeRoot,
          content,
          metadata: {
            actor: options.actor,
            trigger: "auto",
            conversationId: options.conversationId,
          },
        })
        const shouldApply = options.config.soul.autoApply !== false
        if (shouldApply) {
          applySoulDraft({
            workspaceRoot: options.config.workspaceRoot,
            runtimeRoot: options.config.workspaceRuntimeRoot,
            draftId: nextDraft.id,
            metadata: {
              actor: options.actor,
            },
          })
        }
        return {
          draft: nextDraft,
          applied: shouldApply,
        }
      })
      state.autoDraft = {
        lastProcessedTelegramMessageId: draftPlan.nextProcessedTelegramMessageId,
        lastProcessedAt: nowIso,
        lastTrigger: draftPlan.trigger,
      }
      saveConversationReflectionState(options.conversationDir, state)
      result.autoDraft = {
        triggered: true,
        trigger: draftPlan.trigger,
        draftId: draft.id,
        applied,
      }
    }
  }

  if (
    result.growth.triggered ||
    result.relationship.triggered ||
    result.autoDraft.triggered
  ) {
    const chronicle = await updateChatChronicle({
      config: options.config,
      conversationId: options.conversationId,
      conversationDir: options.conversationDir,
      now,
      createCompletion: options.createChronicleCompletion,
    })
    if (chronicle.updated) {
      state.chronicle = {
        lastProcessedTelegramMessageId: chronicle.lastProcessedTelegramMessageId,
        lastProcessedAt: nowIso,
      }
      saveConversationReflectionState(options.conversationDir, state)
      result.chronicle = {
        updated: true,
      }
    }
  }

  return result
}

export async function processConversationReflectionPass(options: {
  config: BotRuntimeConfig
  conversationId: string
  conversationDir: string
  identity: ConversationReflectionIdentity
  actor: string
  now?: Date
  createGrowthCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createRelationshipCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createChronicleCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
  createDraftContent?: (payload: {
    config: BotRuntimeConfig
    conversationId: string
    recentMessages: Message[]
    actor: string
  }) => Promise<string>
}) {
  const key = options.conversationId || options.conversationDir
  const previous = reflectionPassQueues.get(key)?.catch(() => undefined) || Promise.resolve()
  const next = previous.then(
    () => processConversationReflectionPassUnlocked(options),
    () => processConversationReflectionPassUnlocked(options),
  )
  const queued = next.catch(() => undefined)
  reflectionPassQueues.set(key, queued)
  try {
    return await next
  } finally {
    if (reflectionPassQueues.get(key) === queued) {
      reflectionPassQueues.delete(key)
    }
  }
}
