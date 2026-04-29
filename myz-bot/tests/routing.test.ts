import { test } from "node:test"
import assert from "node:assert/strict"
import type { ChatMessage } from "../src/chatChannel"
import { resolveConversationRoute } from "../src/routing"

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 1,
    unixTime: Date.now(),
    text: "hello",
    chat: {
      id: 100,
      type: "private",
    },
    from: {
      id: 200,
      username: "alice",
      firstName: "Alice",
    },
    ...overrides,
  }
}

test("resolveConversationRoute keeps private chats per user", () => {
  const route = resolveConversationRoute(createMessage())
  assert.equal(route.scope, "private")
  assert.equal(route.conversationId, "100-200")
  assert.equal(route.actorDisplayName, "Alice (@alice)")
})

test("resolveConversationRoute shares group conversations by chat", () => {
  const route = resolveConversationRoute(
    createMessage({
      chat: {
        id: -100123,
        type: "group",
      },
      from: {
        id: 201,
        username: "bob",
      },
    }),
  )
  assert.equal(route.scope, "group")
  assert.equal(route.conversationId, "-100123-group")
  assert.equal(route.actorUserId, 201)
})

test("resolveConversationRoute isolates forum topics by thread id", () => {
  const route = resolveConversationRoute(
    createMessage({
      chat: {
        id: -100123,
        type: "supergroup",
      },
      threadId: 88,
    }),
  )
  assert.equal(route.scope, "group")
  assert.equal(route.threadId, 88)
  assert.equal(route.conversationId, "-100123-thread-88")
})
