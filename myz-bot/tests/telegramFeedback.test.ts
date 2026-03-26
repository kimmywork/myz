import { test } from "node:test"
import assert from "node:assert/strict"
import type { ProviderMessage } from "@myz/ai-core/providers/types"
import { createTelegramFeedbackController } from "../src/telegramFeedback"
import type {
  TelegramChatAction,
  TelegramReactionEmoji,
} from "../src/telegram"

test("telegram feedback sends chat actions and marks success on the source message", async () => {
  const actions: Array<{ chatId: number; action: string; threadId?: number }> = []
  const reactions: Array<{ chatId: number; messageId: number; reaction: string | null }> = []

  const feedback = createTelegramFeedbackController({
    telegram: {
      sendChatAction: async (
        chatId: number,
        action: TelegramChatAction,
        options?: { messageThreadId?: number },
      ) => {
        actions.push({ chatId, action, threadId: options?.messageThreadId })
        return true
      },
      setMessageReaction: async (
        chatId: number,
        messageId: number,
        reaction: TelegramReactionEmoji | null,
      ) => {
        reactions.push({ chatId, messageId, reaction })
        return true
      },
    } as any,
    chatId: 42,
    messageThreadId: 9,
    reactionMessageId: 1001,
    heartbeatMs: 20,
  })

  feedback.setPhase("llm")
  await feedback.flush()
  feedback.setPhase("tool")
  await feedback.flush()
  await feedback.complete()

  assert.deepEqual(actions, [
    { chatId: 42, action: "typing", threadId: 9 },
    { chatId: 42, action: "typing", threadId: 9 },
  ])
  assert.deepEqual(reactions, [
    { chatId: 42, messageId: 1001, reaction: "👌" },
  ])
})

test("telegram feedback marks failure when a tool result returns an error", async () => {
  const reactions: Array<string | null> = []
  const feedback = createTelegramFeedbackController({
    telegram: {
      sendChatAction: async () => true,
      setMessageReaction: async (
        _chatId: number,
        _messageId: number,
        reaction: TelegramReactionEmoji | null,
      ) => {
        reactions.push(reaction)
        return true
      },
    } as any,
    chatId: 42,
    reactionMessageId: 1002,
  })

  const toolResultMessage: ProviderMessage = {
    role: "tool",
    tool_call_id: "call-1",
    content: "Error: path not found",
    metadata: {
      toolName: "Read",
      error: "path not found",
    },
  }

  feedback.setPhase("tool")
  feedback.noteToolResult(toolResultMessage)
  await feedback.complete()

  assert.deepEqual(reactions, ["👎"])
})
