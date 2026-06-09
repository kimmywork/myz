import { test } from "node:test"
import assert from "node:assert/strict"
import {
  authorizeMessage,
  evaluateMessageHandling,
} from "../src/permissions"
import type { ChatMessage } from "../src/chatChannel"
import type { BotRuntimeConfig } from "../src/config"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(): BotRuntimeConfig {
  return createRuntimeConfig("/tmp/workspace")
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 1,
    unixTime: Date.now(),
    text: "hello",
    chat: {
      id: 1,
      type: "private",
    },
    from: {
      id: 200,
      username: "alice",
    },
    ...overrides,
  }
}

test("authorizeMessage accepts all messages", () => {
  const config = createConfig()
  const result = authorizeMessage(
    config,
    createMessage({
      from: {
        id: 9999,
        username: "unknown",
      },
    }),
  )
  assert.equal(result.ok, true)
})

test("evaluateMessageHandling always processes and replies", () => {
  const config = createConfig()
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, true)
})
