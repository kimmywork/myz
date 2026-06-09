import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import type { ChatChannelClient, ChatMessage, ChatUser } from "./chatChannel"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import {
  appendMessage,
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
  ensureSessionDir,
  loadAllMessages,
  loadSessionMetadata,
} from "./sessions"
import { prepareSessionContext } from "./contextCompaction"
import { appendSessionErrorLog, formatErrorReply } from "./errors"
import {
  beginScheduledTaskRun,
  failScheduledTaskRun,
  finishScheduledTaskRun,
  listDueScheduledTasks,
  renderDirectTaskReply,
  type ScheduledTask,
} from "./tasks"
import { createToolProgressNotifier } from "./toolProgress"
import {
  appendToolAuditTrace,
  appendToolMessagesToSessionHistory,
} from "./toolHistory"
import type { RuntimeMonitor } from "./runtimeMonitor"

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function buildSyntheticSchedulerUser(metadata: {
  userId?: number
  username?: string
  firstName?: string
  lastName?: string
}): ChatUser | undefined {
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
    firstName: metadata.firstName,
    lastName: metadata.lastName,
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
  channel: ChatChannelClient<ChatMessage>
  sessionId: string
  sessionDir: string
  task: ScheduledTask
  monitor?: RuntimeMonitor
}) {
  const metadata = loadSessionMetadata(options.sessionDir)
  if (!metadata) {
    throw new Error(`会话元数据不存在: ${options.sessionId}`)
  }

  const sessionWorkspace = options.config.workspaceRoot
  const historyBefore = loadAllMessages(options.sessionDir)
  const contextState = options.config.contextCompaction.enabled
    ? prepareSessionContext({
        sessionDir: options.sessionDir,
        sessionId: options.sessionId,
        messages: historyBefore,
        maxHistoryMessages: options.config.contextCompaction.maxHistoryMessages,
        maxHistoryChars: options.config.contextCompaction.maxHistoryChars,
        summaryMaxMessages: options.config.contextCompaction.summaryMaxMessages,
        summaryMaxChars: options.config.contextCompaction.summaryMaxChars,
        compressionCooldownMs: options.config.contextCompaction.compressionCooldownMs,
        contextWindowTokens: options.config.ai.limits.contextWindow,
        maxOutputTokens: options.config.ai.limits.maxOutputTokens,
      })
    : {
        history: historyBefore,
        summary: "",
        compressed: false,
      }

  const userMessage = createUserMessage(
    options.sessionId,
    buildTaskTriggerMessage(options.task),
    {
      type: "scheduled_task_trigger",
      taskId: options.task.id,
      taskTitle: options.task.title,
      taskDueAt: options.task.dueAt,
      triggerMode: options.task.triggerMode,
    },
  )
  appendMessage(options.sessionDir, userMessage)
  options.monitor?.noteIncomingMessage({
    sessionId: options.sessionId,
    text: userMessage.content,
    role: "scheduler",
  })

  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  const systemMessage = createSystemMessage(
    options.sessionId,
    agent.buildSystemPrompt({
      replyMode: "required",
      scope: metadata.scope,
      sessionWorkspace,
      user: {
        userId: metadata.userId,
        chatId: metadata.chatId ?? 0,
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
    replyMode: "required",
    scope: metadata.scope,
    sessionWorkspace,
    user: {
      userId: metadata.userId,
      chatId: metadata.chatId ?? 0,
      username: metadata.username,
      firstName: metadata.firstName,
      lastName: metadata.lastName,
    },
  })
  const contextMessage = contextPrompt
    ? createUserMessage(options.sessionId, contextPrompt, {
        type: "context_injection",
        source: "scheduler",
        hiddenFromHistory: true,
      })
    : null

  const progressNotifier = createToolProgressNotifier({
    config: options.config,
    channel: options.channel,
    sessionDir: options.sessionDir,
    sessionId: options.sessionId,
    chatId: metadata.chatId ?? 0,
    latestUserInput: userMessage.content,
    sendOptions: {
      messageThreadId: metadata.threadId,
    },
    onProgressMessageSent: ({ text }) => {
      options.monitor?.noteOutgoingMessage({
        sessionId: options.sessionId,
        text,
        role: "progress",
      })
    },
  })
  try {
    options.monitor?.notePhase("llm", options.sessionId)
    const preparedMessages = agent.prepareMessages({
      systemMessage,
      history: contextState.history,
      contextMessage,
      userMessage,
    })
    const request = options.monitor?.noteRequestStart({
      sessionId: options.sessionId,
      source: "scheduler",
      messages: preparedMessages,
    })
    const reply = await generateReply({
      config: options.config,
      messages: preparedMessages,
      sessionId: options.sessionId,
      onToolCallMessage: (message) => {
        options.monitor?.notePhase("tool", options.sessionId)
        progressNotifier.onToolCallMessage(message)
      },
      onToolResultMessage: (message) => {
        options.monitor?.notePhase("llm", options.sessionId)
        progressNotifier.onToolResultMessage(message)
      },
    })
    if (request) {
      options.monitor?.noteRequestComplete({
        sessionId: options.sessionId,
        source: "scheduler",
        startedAt: request.startedAt,
        requestId: request.requestId,
        usage: reply.usage as TokenUsage | undefined,
        toolCallCount: Array.isArray(reply.toolCalls) ? reply.toolCalls.length : 0,
      })
    }
    await progressNotifier.flush()

    if (Array.isArray(reply.toolTrace) && reply.toolTrace.length) {
      appendToolMessagesToSessionHistory({
        sessionId: options.sessionId,
        sessionDir: options.sessionDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
      appendToolAuditTrace({
        sessionId: options.sessionId,
        sessionDir: options.sessionDir,
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
      options.sessionId,
      reply.content || "(无响应)",
      {
        type: "scheduled_task_reply",
        taskId: options.task.id,
        toolCallCount: Array.isArray(reply.toolCalls) ? reply.toolCalls.length : 0,
        usage: reply.usage as TokenUsage | undefined,
        ...(reply.responseId
          ? {
              providerResponseId: reply.responseId,
              providerResponseResumable: Boolean(reply.responseResumable),
            }
          : {}),
        ...(reply.previousResponseId
          ? { providerPreviousResponseId: reply.previousResponseId }
          : {}),
        ...(reply.promptCacheKey
          ? { providerPromptCacheKey: reply.promptCacheKey }
          : {}),
      },
    )
    if (Array.isArray(reply.toolCalls) && reply.toolCalls.length) {
      assistantMessage.tool_calls = reply.toolCalls as Message["tool_calls"]
    }
    options.monitor?.notePhase("send", options.sessionId)
    options.monitor?.noteOutgoingMessage({
      sessionId: options.sessionId,
      text: assistantMessage.content,
      role: "assistant",
    })
    appendMessage(options.sessionDir, assistantMessage)
    await options.channel.sendMessage(
      metadata.chatId ?? 0,
      assistantMessage.content,
      {
        messageThreadId: metadata.threadId,
      },
    )
    options.monitor?.notePhase("idle", options.sessionId)
  } catch (error) {
    options.monitor?.noteError({
      sessionId: options.sessionId,
      error,
    })
    throw error
  }
}

async function processScheduledDirectTask(options: {
  config: BotRuntimeConfig
  channel: ChatChannelClient<ChatMessage>
  sessionId: string
  sessionDir: string
  task: ScheduledTask
  monitor?: RuntimeMonitor
}) {
  const metadata = loadSessionMetadata(options.sessionDir)
  if (!metadata) {
    throw new Error(`会话元数据不存在: ${options.sessionId}`)
  }
  const userMessage = createUserMessage(
    options.sessionId,
    buildTaskTriggerMessage(options.task),
    {
      type: "scheduled_task_trigger",
      taskId: options.task.id,
      taskTitle: options.task.title,
      taskDueAt: options.task.dueAt,
      triggerMode: options.task.triggerMode,
    },
  )
  appendMessage(options.sessionDir, userMessage)
  options.monitor?.noteIncomingMessage({
    sessionId: options.sessionId,
    text: userMessage.content,
    role: "scheduler",
  })

  const assistantMessage = createAssistantMessage(
    options.sessionId,
    renderDirectTaskReply(options.task),
    {
      type: "scheduled_task_reply",
      taskId: options.task.id,
      direct: true,
    },
  )
  options.monitor?.notePhase("send", options.sessionId)
  options.monitor?.noteOutgoingMessage({
    sessionId: options.sessionId,
    text: assistantMessage.content,
    role: "assistant",
  })
  appendMessage(options.sessionDir, assistantMessage)
  await options.channel.sendMessage(
    metadata.chatId ?? 0,
    assistantMessage.content,
    {
      messageThreadId: metadata.threadId,
    },
  )
  options.monitor?.notePhase("idle", options.sessionId)
}

export async function processDueScheduledTasks(options: {
  config: BotRuntimeConfig
  channel: ChatChannelClient<ChatMessage>
  monitor?: RuntimeMonitor
}) {
  const dueTasks = listDueScheduledTasks({
    sessionsDir: options.config.sessionsDir,
    limit: options.config.scheduler.maxBatchSize,
  })

  for (const due of dueTasks) {
    const sessionDir = ensureSessionDir(
      options.config.sessionsDir,
      due.sessionId,
    )
    const runningTask = beginScheduledTaskRun({
      sessionDir,
      sessionId: due.sessionId,
      taskId: due.task.id,
    })
    if (!runningTask) continue

    try {
      if (runningTask.triggerMode === "direct") {
        await processScheduledDirectTask({
          config: options.config,
          channel: options.channel,
          sessionId: due.sessionId,
          sessionDir,
          task: runningTask,
          monitor: options.monitor,
        })
      } else {
        await processScheduledLlmTask({
          config: options.config,
          channel: options.channel,
          sessionId: due.sessionId,
          sessionDir,
          task: runningTask,
          monitor: options.monitor,
        })
      }

      finishScheduledTaskRun({
        sessionDir,
        sessionId: due.sessionId,
        taskId: runningTask.id,
        status: "triggered",
      })
    } catch (error) {
      const normalized = appendSessionErrorLog({
        sessionDir,
        sessionId: due.sessionId,
        phase: "scheduled_task",
        error,
        context: {
          taskId: runningTask.id,
          taskTitle: runningTask.title,
          triggerMode: runningTask.triggerMode,
        },
      })
      failScheduledTaskRun({
        sessionDir,
        sessionId: due.sessionId,
        taskId: runningTask.id,
        error: normalized.message,
        baseDelayMs: options.config.scheduler.failureRetryBaseDelayMs,
      })

      const metadata = loadSessionMetadata(sessionDir)
      if (metadata) {
        const errorUser = buildSyntheticSchedulerUser({
          userId: metadata.userId,
          username: metadata.username,
          firstName: metadata.firstName,
          lastName: metadata.lastName,
        })
        options.monitor?.notePhase("send", due.sessionId)
        const errorText = formatErrorReply({
          config: options.config,
          user: errorUser,
          error,
        })
        options.monitor?.noteOutgoingMessage({
          sessionId: due.sessionId,
          text: errorText,
          role: "error",
        })
        await options.channel.sendMessage(
          metadata.chatId ?? 0,
          errorText,
          {
            messageThreadId: metadata.threadId,
          },
        )
      }
    }
  }
}

export function startTaskScheduler(options: {
  config: BotRuntimeConfig
  channel: ChatChannelClient<ChatMessage>
  monitor?: RuntimeMonitor
}) {
  let stopped = false

  const loop = async () => {
    while (!stopped) {
      try {
        await processDueScheduledTasks(options)
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
