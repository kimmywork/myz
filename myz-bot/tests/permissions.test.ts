import { test } from "node:test"
import assert from "node:assert/strict"
import {
  authorizeMessage,
  evaluateMessageHandling,
  shouldRespondToMessage,
} from "../src/permissions"
import type { ChatMessage } from "../src/chatChannel"
import type { BotRuntimeConfig } from "../src/config"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(): BotRuntimeConfig {
  return createRuntimeConfig("/tmp/workspace", {
    channels: {
      telegram: {
        allowedUsers: ["alice", "1001"],
        allowedChats: [1, 2],
        adminUsers: ["admin"],
      },
    },
  })
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 1,
    unixTime: Date.now(),
    text: "hello @testbot",
    chat: {
      id: 1,
      type: "group",
    },
    from: {
      id: 1001,
      username: "alice",
    },
    ...overrides,
  }
}

test("authorizeMessage rejects unlisted users", () => {
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
  assert.equal(result.ok, false)
})

test("shouldRespondToMessage requires mention in groups", () => {
  const config = createConfig()
  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(result, false)
})

test("shouldRespondToMessage allows admin command without mention", () => {
  const config = createConfig()
  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "/soul draft",
      from: {
        id: 7,
        username: "admin",
      },
    }),
    "testbot",
  )
  assert.equal(result, true)
})

test("shouldRespondToMessage accepts all group messages when mention gate is disabled", () => {
  const config = createConfig()
  config.channels.telegram!.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, false)

  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(result, false)
})

test("evaluateMessageHandling still replies to mentions when mention gate is disabled", () => {
  const config = createConfig()
  config.channels.telegram!.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "hello @testbot",
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, true)
})

test("evaluateMessageHandling still replies to admin commands when mention gate is disabled", () => {
  const config = createConfig()
  config.channels.telegram!.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "/soul draft",
      from: {
        id: 7,
        username: "admin",
      },
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, true)
})
