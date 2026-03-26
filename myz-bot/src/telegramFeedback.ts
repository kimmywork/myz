import type { ProviderMessage } from "@myz/ai-core/providers/types"
import type {
  TelegramChatAction,
  TelegramClient,
  TelegramReactionEmoji,
} from "./telegram"

export type TelegramFeedbackPhase = "llm" | "tool" | "other"

const PHASE_ACTIONS: Record<TelegramFeedbackPhase, TelegramChatAction> = {
  llm: "typing",
  tool: "typing",
  other: "typing",
}

const SUCCESS_REACTION: TelegramReactionEmoji = "👌"
const FAILURE_REACTION: TelegramReactionEmoji = "👎"

function isToolResultError(message: ProviderMessage) {
  const metadata =
    "metadata" in message && message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null
  if (metadata?.error) return true
  const content = typeof message.content === "string" ? message.content.trim() : ""
  return /^error:/i.test(content)
}

export function createTelegramFeedbackController(options: {
  telegram: TelegramClient
  chatId: number
  messageThreadId?: number
  reactionMessageId?: number
  heartbeatMs?: number
}) {
  const heartbeatMs = Math.max(500, options.heartbeatMs ?? 4500)
  let interval: NodeJS.Timeout | null = null
  let currentPhase: TelegramFeedbackPhase | null = null
  let toolFailed = false
  let closed = false
  let queue = Promise.resolve()

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task, task).catch(() => undefined)
  }

  const stopHeartbeat = () => {
    if (!interval) return
    clearInterval(interval)
    interval = null
  }

  const sendChatActionOnce = (phase: TelegramFeedbackPhase) => {
    enqueue(async () => {
      if (closed) return
      await options.telegram.sendChatAction(options.chatId, PHASE_ACTIONS[phase], {
        messageThreadId: options.messageThreadId,
      })
    })
  }

  const markSuccess = async () => {
    if (!options.reactionMessageId || closed || toolFailed) return
    stopHeartbeat()
    enqueue(async () => {
      await options.telegram.setMessageReaction(
        options.chatId,
        options.reactionMessageId!,
        SUCCESS_REACTION,
      )
    })
    await queue
  }

  const markFailure = async () => {
    if (!options.reactionMessageId || closed) return
    stopHeartbeat()
    enqueue(async () => {
      await options.telegram.setMessageReaction(
        options.chatId,
        options.reactionMessageId!,
        FAILURE_REACTION,
      )
    })
    await queue
  }

  return {
    setPhase(phase: TelegramFeedbackPhase) {
      if (closed) return
      currentPhase = phase
      stopHeartbeat()
      sendChatActionOnce(phase)
      interval = setInterval(() => {
        if (!currentPhase || closed) return
        sendChatActionOnce(currentPhase)
      }, heartbeatMs)
      interval.unref?.()
    },

    noteToolResult(message: ProviderMessage) {
      if (isToolResultError(message)) {
        toolFailed = true
      }
    },

    markSuccess,

    markFailure,

    async complete(options: { failed?: boolean } = {}) {
      stopHeartbeat()
      const failed = options.failed || toolFailed
      if (failed) {
        await markFailure()
      } else {
        await markSuccess()
      }
      closed = true
      await queue
    },

    async flush() {
      await queue
    },
  }
}
