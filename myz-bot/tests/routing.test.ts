import { test } from "node:test"
import assert from "node:assert/strict"
import type { ChatMessage } from "../src/chatChannel"
import { resolveSessionRoute } from "../src/routing"

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

test("resolveSessionRoute keeps private chats per user", () => {
  const route = resolveSessionRoute(createMessage())
  assert.equal(route.scope, "private")
  assert.equal(route.sessionId, "100-200")
  assert.equal(route.actorDisplayName, "Alice (@alice)")
})

test("resolveSessionRoute shares group conversations by chat", () => {
  const route = resolveSessionRoute(
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
  assert.equal(route.sessionId, "-100123-group")
  assert.equal(route.actorUserId, 201)
})

test("resolveSessionRoute isolates forum topics by thread id", () => {
  const route = resolveSessionRoute(
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
  assert.equal(route.sessionId, "-100123-thread-88")
})
