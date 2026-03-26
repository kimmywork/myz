import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildIncomingMessage } from "../src/incoming"
import type { TelegramClient, TelegramMessage } from "../src/telegram"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(root: string) {
  return createRuntimeConfig(root)
}

function createMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 100,
      type: "private",
    },
    from: {
      id: 200,
      username: "alice",
      first_name: "Alice",
    },
    ...overrides,
  }
}

test("buildIncomingMessage stores document attachments with a readable virtual path and no duplicate extension", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-incoming-"))
  const conversationDir = join(root, "conversations", "100-200")
  const message = createMessage({
    document: {
      file_id: "doc-1",
      file_name: "稿子.md",
      mime_type: "text/markdown",
    },
  })

  const telegram: TelegramClient = {
    getUpdates: async () => [],
    sendMessage: async () => [],
    sendChatAction: async () => true,
    setMessageReaction: async () => true,
    getMe: async () => ({ id: 1 }),
    getFile: async () => ({
      file_id: "doc-1",
      file_path: "documents/source.md",
    }),
    downloadFile: async () => new TextEncoder().encode("# Hello").buffer,
  }

  const incoming = await buildIncomingMessage({
    config: createConfig(root),
    telegram,
    message,
    conversationDir,
  })

  assert.match(incoming.content, /文件已保存：\/attachments\//)
  assert.doesNotMatch(incoming.content, /\.md\.md/)
  const telegramAttachments = (incoming.metadata?.telegramAttachments || []) as Array<
    { path?: string; fileName?: string; virtualPath?: string }
  >
  const stored = telegramAttachments[0] as
    | { path?: string; fileName?: string; virtualPath?: string }
    | undefined
  assert.ok(stored)
  assert.match(stored?.fileName || "", /\.md$/)
  assert.doesNotMatch(stored?.fileName || "", /\.md\.md$/)
  assert.equal(stored?.virtualPath, `/attachments/${stored?.fileName}`)
  assert.equal(existsSync(stored?.path || ""), true)
})

test("buildIncomingMessage falls back to a stable stem when document name sanitizes to empty", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-incoming-"))
  const conversationDir = join(root, "conversations", "100-200")
  const message = createMessage({
    document: {
      file_id: "doc-2",
      file_name: "《》.md",
      mime_type: "text/markdown",
    },
  })

  const telegram: TelegramClient = {
    getUpdates: async () => [],
    sendMessage: async () => [],
    sendChatAction: async () => true,
    setMessageReaction: async () => true,
    getMe: async () => ({ id: 1 }),
    getFile: async () => ({
      file_id: "doc-2",
      file_path: "documents/source.md",
    }),
    downloadFile: async () => new TextEncoder().encode("# Hello").buffer,
  }

  const incoming = await buildIncomingMessage({
    config: createConfig(root),
    telegram,
    message,
    conversationDir,
  })

  const telegramAttachments = (incoming.metadata?.telegramAttachments || []) as Array<
    { fileName?: string; virtualPath?: string }
  >
  const stored = telegramAttachments[0] as
    | { fileName?: string; virtualPath?: string }
    | undefined
  assert.match(stored?.fileName || "", /document-1\.md$/)
  assert.equal(stored?.virtualPath, `/attachments/${stored?.fileName}`)
})
