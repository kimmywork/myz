import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { processConversationReflectionPass } from "./conversationReflections"
import {
  loadRecoveredContext,
  recoverContextIfNeeded,
} from "./contextRecovery"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import {
  appendMessage,
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
  ensureConversationDir,
  loadAllMessages,
  loadMetadata,
  saveMetadata,
} from "./conversations"
import { prepareConversationContext } from "./context"
import { appendConversationErrorLog, formatErrorReply } from "./errors"
import {
  beginScheduledTaskRun,
  failScheduledTaskRun,
  finishScheduledTaskRun,
  listDueScheduledTasks,
  renderDirectTaskReply,
  type ScheduledTask,
} from "./tasks"
import { loadSoul } from "./soul"
import type { TelegramClient, TelegramUser } from "./telegram"
import { sendRecordedTelegramMessage } from "./telegramDelivery"
import { createTelegramFeedbackController } from "./telegramFeedback"
import { createToolProgressNotifier } from "./toolProgress"
import {
  appendToolAuditTrace,
  appendToolMessagesToHistory,
} from "./toolHistory"

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function buildSyntheticSchedulerUser(metadata: {
  userId?: number
  username?: string
  firstName?: string
  lastName?: string
}): TelegramUser | undefined {
  if (
    typeof metadata.userId !== "number" &&
    !metadata.username &&
    !metadata.firstName &&
    !metadata.lastName
  ) {
    return undefined
  }
  return {
    id: metadata.userId || 0,
    username: metadata.username,
    first_name: metadata.firstName,
    last_name: metadata.lastName,
  }
}

function formatCurrentDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function buildTaskTriggerMessage(task: ScheduledTask) {
  return [
    "[Scheduled Task Trigger]",
    `当前日期: ${formatCurrentDate()}`,
    `任务 ID: ${task.id}`,
    `标题: ${task.title}`,
    `计划触发时间: ${task.dueAt}`,
    `触发模式: ${task.triggerMode}`,
    task.instructions ? `说明: ${task.instructions}` : "",
    "请基于当前会话上下文继续处理这个任务；如果只是提醒，直接给出提醒；如果需要进一步整理或调用工具，可以继续执行。",
  ]
    .filter(Boolean)
    .join("\n")
}

async function processScheduledLlmTask(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
  conversationId: string
  conversationDir: string
  task: ScheduledTask
}) {
  const metadata = loadMetadata(options.conversationDir)
  if (!metadata) {
    throw new Error(`会话元数据不存在: ${options.conversationId}`)
  }

  const sessionWorkspace = options.config.workspaceRoot
  const historyBefore = loadAllMessages(options.conversationDir)
  const contextState = prepareConversationContext({
    conversationDir: options.conversationDir,
    conversationId: options.conversationId,
    memoryDir: options.config.memoryDir,
    messages: historyBefore,
    contextWindowTokens: options.config.ai.limits.contextWindow,
    maxOutputTokens: options.config.ai.limits.maxOutputTokens,
  })
  if (contextState.compressed) {
    metadata.lastCompressionAt = new Date().toISOString()
    saveMetadata(options.conversationDir, metadata)
  }

  const userMessage = createUserMessage(
    options.conversationId,
    buildTaskTriggerMessage(options.task),
    {
      type: "scheduled_task_trigger",
      taskId: options.task.id,
      taskTitle: options.task.title,
      taskDueAt: options.task.dueAt,
      triggerMode: options.task.triggerMode,
    },
  )
  appendMessage(options.conversationDir, userMessage)

  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  const recoveredContext = contextState.compressed
    ? (
        await recoverContextIfNeeded({
          config: options.config,
          conversationId: options.conversationId,
          conversationDir: options.conversationDir,
          memoryDir: options.config.memoryDir,
          latestUserInput: userMessage.content,
          runtimeHistoryLength: contextState.history.length,
          contextWindowTokens: options.config.ai.limits.contextWindow,
          maxOutputTokens: options.config.ai.limits.maxOutputTokens,
          force: true,
        })
      ).recoveredContext
    : loadRecoveredContext(options.conversationDir)
  const systemMessage = createSystemMessage(
    options.conversationId,
    agent.buildSystemPrompt({
      conversationSummary: contextState.summary,
      recoveredContext,
      replyMode: "required",
      scope: metadata.scope,
      sessionWorkspace,
      user: {
        userId: metadata.userId,
        chatId: metadata.chatId,
        username: metadata.username,
        firstName: metadata.firstName,
        lastName: metadata.lastName,
      },
    }),
    {
      source: "scheduler",
      taskId: options.task.id,
      agent: agent.id,
      compressed: contextState.compressed,
    },
  )
  const contextPrompt = agent.buildContextPrompt({
    conversationSummary: contextState.summary,
    recoveredContext,
    replyMode: "required",
    scope: metadata.scope,
    sessionWorkspace,
    user: {
      userId: metadata.userId,
      chatId: metadata.chatId,
      username: metadata.username,
      firstName: metadata.firstName,
      lastName: metadata.lastName,
    },
  })
  const contextMessage = contextPrompt
    ? createUserMessage(options.conversationId, contextPrompt, {
        type: "context_injection",
        source: "scheduler",
        hiddenFromHistory: true,
      })
    : null

  const progressNotifier = createToolProgressNotifier({
    config: options.config,
    telegram: options.telegram,
    conversationDir: options.conversationDir,
    conversationId: options.conversationId,
    chatId: metadata.chatId,
    latestUserInput: userMessage.content,
    soul: loadSoul(options.config.workspaceRoot),
    sendOptions: {
      messageThreadId: metadata.threadId,
    },
  })
  const telegramFeedback = createTelegramFeedbackController({
    telegram: options.telegram,
    chatId: metadata.chatId,
    messageThreadId: metadata.threadId,
  })
  try {
    telegramFeedback.setPhase("llm")
    const reply = await generateReply({
      config: options.config,
      messages: agent.prepareMessages({
        systemMessage,
        history: contextState.history,
        contextMessage,
        userMessage,
      }),
      conversationId: options.conversationId,
      onToolCallMessage: (message) => {
        telegramFeedback.setPhase("tool")
        progressNotifier.onToolCallMessage(message)
      },
      onToolResultMessage: (message) => {
        telegramFeedback.noteToolResult(message)
        telegramFeedback.setPhase("llm")
        progressNotifier.onToolResultMessage(message)
      },
    })
    await progressNotifier.flush()

    if (Array.isArray(reply.toolTrace) && reply.toolTrace.length) {
      appendToolMessagesToHistory({
        conversationId: options.conversationId,
        conversationDir: options.conversationDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
      appendToolAuditTrace({
        conversationId: options.conversationId,
        conversationDir: options.conversationDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
    }

    const assistantMessage = createAssistantMessage(
      options.conversationId,
      reply.content || "(无响应)",
      {
        type: "scheduled_task_reply",
        taskId: options.task.id,
        toolCallCount: Array.isArray(reply.toolCalls) ? reply.toolCalls.length : 0,
        usage: reply.usage as TokenUsage | undefined,
      },
    )
    if (Array.isArray(reply.toolCalls) && reply.toolCalls.length) {
      assistantMessage.tool_calls = reply.toolCalls as Message["tool_calls"]
    }
    appendMessage(options.conversationDir, assistantMessage)
    await sendRecordedTelegramMessage({
      telegram: options.telegram,
      conversationDir: options.conversationDir,
      conversationId: options.conversationId,
      chatId: metadata.chatId,
      text: assistantMessage.content,
      sendOptions: {
        messageThreadId: metadata.threadId,
      },
      kind: "scheduler",
    })
    await telegramFeedback.complete()
  } catch (error) {
    await telegramFeedback.complete({ failed: true })
    throw error
  }
}

async function processScheduledDirectTask(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
  conversationId: string
  conversationDir: string
  task: ScheduledTask
}) {
  const metadata = loadMetadata(options.conversationDir)
  if (!metadata) {
    throw new Error(`会话元数据不存在: ${options.conversationId}`)
  }
  const userMessage = createUserMessage(
    options.conversationId,
    buildTaskTriggerMessage(options.task),
    {
      type: "scheduled_task_trigger",
      taskId: options.task.id,
      taskTitle: options.task.title,
      taskDueAt: options.task.dueAt,
      triggerMode: options.task.triggerMode,
    },
  )
  appendMessage(options.conversationDir, userMessage)

  const assistantMessage = createAssistantMessage(
    options.conversationId,
    renderDirectTaskReply(options.task),
    {
      type: "scheduled_task_reply",
      taskId: options.task.id,
      direct: true,
    },
  )
  appendMessage(options.conversationDir, assistantMessage)
  await sendRecordedTelegramMessage({
    telegram: options.telegram,
    conversationDir: options.conversationDir,
    conversationId: options.conversationId,
    chatId: metadata.chatId,
    text: assistantMessage.content,
    sendOptions: {
      messageThreadId: metadata.threadId,
    },
    kind: "scheduler",
  })
}

export async function processDueConversationReflections(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
  processReflectionPass?: typeof processConversationReflectionPass
}) {
  if (!existsSync(options.config.conversationsDir)) {
    return
  }

  const runReflectionPass =
    options.processReflectionPass || processConversationReflectionPass

  for (const name of readdirSync(options.config.conversationsDir)) {
    const conversationDir = resolve(options.config.conversationsDir, name)
    const metadata = loadMetadata(conversationDir)
    if (!metadata) continue

    try {
      const reflection = await runReflectionPass({
        config: options.config,
        conversationId: metadata.conversationId,
        conversationDir,
        identity: {
          actorUserId:
            metadata.scope === "private"
              ? metadata.userId
              : metadata.lastActorUserId,
          chatId: metadata.chatId,
          username: metadata.username,
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          displayName:
            metadata.lastActorDisplayName ||
            [metadata.firstName, metadata.lastName].filter(Boolean).join(" ").trim() ||
            metadata.username ||
            metadata.conversationId,
          scope:
            metadata.scope === "group" || metadata.chatType === "group"
              ? "group"
              : "private",
        },
        actor: "auto",
      })

      if (
        reflection.autoDraft.triggered &&
        reflection.autoDraft.applied === false &&
        reflection.autoDraft.draftId
      ) {
        const isAdminConversation =
          Boolean(metadata.username) &&
          options.config.telegram.adminUsers.includes(metadata.username || "")
        if (isAdminConversation) {
          await sendRecordedTelegramMessage({
            telegram: options.telegram,
            conversationDir,
            conversationId: metadata.conversationId,
            chatId: metadata.chatId,
            text: `已自动生成 SOUL 草案：${reflection.autoDraft.draftId}`,
            sendOptions: {
              messageThreadId: metadata.threadId,
            },
            kind: "command",
          })
        }
      }
    } catch (error) {
      appendConversationErrorLog({
        conversationDir,
        conversationId: metadata.conversationId,
        phase: "periodic_reflection",
        error,
        context: {
          chatId: metadata.chatId,
        },
      })
    }
  }
}

export async function processDueScheduledTasks(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
}) {
  const dueTasks = listDueScheduledTasks({
    conversationsDir: options.config.conversationsDir,
    limit: options.config.scheduler.maxBatchSize,
  })

  for (const due of dueTasks) {
    const conversationDir = ensureConversationDir(
      options.config.conversationsDir,
      due.conversationId,
    )
    const runningTask = beginScheduledTaskRun({
      conversationDir,
      conversationId: due.conversationId,
      taskId: due.task.id,
    })
    if (!runningTask) continue

    try {
      if (runningTask.triggerMode === "direct") {
        await processScheduledDirectTask({
          config: options.config,
          telegram: options.telegram,
          conversationId: due.conversationId,
          conversationDir,
          task: runningTask,
        })
      } else {
        await processScheduledLlmTask({
          config: options.config,
          telegram: options.telegram,
          conversationId: due.conversationId,
          conversationDir,
          task: runningTask,
        })
      }

      finishScheduledTaskRun({
        conversationDir,
        conversationId: due.conversationId,
        taskId: runningTask.id,
        status: "triggered",
      })
    } catch (error) {
      const normalized = appendConversationErrorLog({
        conversationDir,
        conversationId: due.conversationId,
        phase: "scheduled_task",
        error,
        context: {
          taskId: runningTask.id,
          taskTitle: runningTask.title,
          triggerMode: runningTask.triggerMode,
        },
      })
      failScheduledTaskRun({
        conversationDir,
        conversationId: due.conversationId,
        taskId: runningTask.id,
        error: normalized.message,
        baseDelayMs: options.config.scheduler.failureRetryBaseDelayMs,
      })

      const metadata = loadMetadata(conversationDir)
      if (metadata) {
        const errorUser = buildSyntheticSchedulerUser({
          userId: metadata.userId,
          username: metadata.username,
          firstName: metadata.firstName,
          lastName: metadata.lastName,
        })
        await sendRecordedTelegramMessage({
          telegram: options.telegram,
          conversationDir,
          conversationId: due.conversationId,
          chatId: metadata.chatId,
          text: formatErrorReply({
            config: options.config,
            user: errorUser,
            error,
          }),
          sendOptions: {
            messageThreadId: metadata.threadId,
          },
          kind: "error",
        })
      }
    }
  }
}

export function startTaskScheduler(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
}) {
  let stopped = false

  const loop = async () => {
    while (!stopped) {
      try {
        await processDueScheduledTasks(options)
        await processDueConversationReflections(options)
      } catch (error) {
        console.error("Task scheduler failed:", error)
      }
      await sleep(options.config.scheduler.pollIntervalMs)
    }
  }

  void loop()

  return {
    stop() {
      stopped = true
    },
  }
}
