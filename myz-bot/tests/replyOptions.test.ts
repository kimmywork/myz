import { test } from "node:test"
import assert from "node:assert/strict"
import { buildReplyOptions } from "../src/replyOptions"
import type { ChatMessage } from "../src/chatChannel"

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 1,
    unixTime: Date.now(),
    chat: {
      id: 1,
      type: "private",
    },
    ...overrides,
  }
}

test("buildReplyOptions does not quote by default in private chats", () => {
  assert.deepEqual(
    buildReplyOptions(createMessage()),
    {},
  )
})

test("buildReplyOptions keeps quoting in groups", () => {
  assert.deepEqual(
    buildReplyOptions(
      createMessage({
        chat: {
          id: 2,
          type: "group",
        },
      }),
    ),
    { replyToMessageId: 1 },
  )
})

test("buildReplyOptions preserves topic thread ids without forcing quote in private chats", () => {
  assert.deepEqual(
    buildReplyOptions(
      createMessage({
        threadId: 99,
      }),
    ),
    { messageThreadId: 99 },
  )
})

test("buildReplyOptions can force quoting when context must be anchored", () => {
  assert.deepEqual(
    buildReplyOptions(createMessage(), { forceQuote: true }),
    { replyToMessageId: 1 },
  )
})
