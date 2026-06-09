import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildIncomingMessage } from "../src/incoming"
import type { ChatMessage } from "../src/chatChannel"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(root: string) {
  return createRuntimeConfig(root)
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 1,
    unixTime: Math.floor(Date.now() / 1000),
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

test("buildIncomingMessage extracts plain text content", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-incoming-"))
  const conversationDir = join(root, "conversations", "100-200")
  const message = createMessage({
    text: "hello world",
  })

  const incoming = await buildIncomingMessage({
    config: createConfig(root),
    message,
    conversationDir,
  })

  assert.equal(incoming.content, "hello world")
  assert.equal(incoming.metadata?.chatId, 100)
  assert.equal(incoming.metadata?.chatType, "private")
})

test("buildIncomingMessage falls back when message has no text", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-incoming-"))
  const conversationDir = join(root, "conversations", "100-200")
  const message = createMessage({})

  const incoming = await buildIncomingMessage({
    config: createConfig(root),
    message,
    conversationDir,
  })

  assert.match(incoming.content, /收到一条无文本消息/)
})

test("buildIncomingMessage includes caption content", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-incoming-"))
  const conversationDir = join(root, "conversations", "100-200")
  const message = createMessage({
    caption: "photo caption",
  })

  const incoming = await buildIncomingMessage({
    config: createConfig(root),
    message,
    conversationDir,
  })

  assert.equal(incoming.content, "photo caption")
})
