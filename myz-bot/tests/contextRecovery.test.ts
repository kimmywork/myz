import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BotRuntimeConfig } from "../src/config"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import { ensureConversationDir } from "../src/conversations"
import { recoverContextIfNeeded } from "../src/contextRecovery"
import { addMemory, ensureMemoryDir, saveConversationSummary } from "../src/memory"
import { touchRelationshipRecord } from "../src/relationships"
import {
  recordIncomingTelegramMessage,
  recordOutgoingTelegramMessages,
} from "../src/telegramHistory"

function createConfig(root: string): BotRuntimeConfig {
  return createRuntimeConfig(root)
}

test("recoverContextIfNeeded uses llm-selected long-term context and caches it", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-recovery-"))
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  mkdirSync(join(conversationDir, "context"), { recursive: true })

  writeFileSync(join(root, "SOUL.md"), "# Bot\n温柔、可靠。")
  writeFileSync(
    join(conversationDir, "context", "chat-chronicle.md"),
    [
      "# Chat Chronicle",
      "",
      "## 长期脉络",
      "- 用户最近在整理 bot 的长期记忆、关系和成长层。",
    ].join("\n"),
  )
  saveConversationSummary(config.memoryDir, "c1", "会话压缩摘要\n\n用户最近一直在收敛上下文结构。")
  ensureMemoryDir(config.memoryDir)
  addMemory(config.memoryDir, {
    title: "用户偏好",
    content: "用户希望 bot 在长期状态恢复时更多依赖 LLM 判断相关性。",
    tags: ["auto-memory", "conversation:c1"],
  })
  touchRelationshipRecord({
    workspaceRoot: root,
    conversationId: "c1",
    scope: "private",
    chatId: 101,
    actorUserId: 7,
    username: "alice",
    firstName: "Alice",
    displayName: "Alice (@alice)",
  })
  mkdirSync(join(root, "relationships", "archive"), { recursive: true })
  mkdirSync(join(root, "soul", "archive"), { recursive: true })
  writeFileSync(
    join(root, "relationships", "archive", "relationship-reflections-1.jsonl"),
    '{"summary":"用户偏好通过长期记忆衔接上下文"}\n',
  )
  writeFileSync(
    join(root, "soul", "archive", "growth-events-1.jsonl"),
    '{"userExcerpt":"用户希望 bot 更会延续长期脉络"}\n',
  )

  recordIncomingTelegramMessage({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    message: {
      message_id: 101,
      date: Date.parse("2026-03-12T00:00:00.000Z") / 1000,
      text: "你还记得我们前面聊过的上下文恢复策略吗？",
      chat: { id: 101, type: "private" },
      from: { id: 7, username: "alice", first_name: "Alice" },
    },
  })
  recordOutgoingTelegramMessages({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    sendResult: [
      {
        message_id: 102,
        date: Date.parse("2026-03-12T00:00:10.000Z") / 1000,
        text: "记得，你想让恢复层尽量靠模型去判断相关性。",
        chat: { id: 101, type: "private" },
        from: { id: 999, username: "testbot" },
      },
    ],
  })

  let completionCalls = 0
  const first = await recoverContextIfNeeded({
    config,
    conversationId: "c1",
    conversationDir,
    memoryDir: config.memoryDir,
    workspaceRoot: root,
    actorUserId: 7,
    username: "alice",
    latestUserInput: "你还记得我们前面聊过的上下文恢复策略吗？",
    runtimeHistoryLength: 3,
    maxHistoryMessages: config.context.maxHistoryMessages,
    createCompletion: async (messages) => {
      completionCalls += 1
      const prompt = messages.map((message) => String(message.content || "")).join("\n")
      assert.match(prompt, /chat-chronicle/i)
      assert.match(prompt, /memory:用户偏好/)
      return [
        "## 恢复上下文",
        "- 用户最近一直在推动 bot 的长期上下文恢复机制。",
        "## 当前相关长期线索",
        "- 偏好让模型自己判断 chronicle、growth、relationship 和记忆哪些更相关。",
      ].join("\n")
    },
  })

  assert.equal(first.used, true)
  assert.equal(first.cached, false)
  assert.match(first.recoveredContext, /长期上下文恢复机制/)

  const cacheFile = join(conversationDir, "context", "recovered-context.json")
  assert.equal(existsSync(cacheFile), true)
  assert.match(readFileSync(cacheFile, "utf-8"), /长期上下文恢复机制/)

  const second = await recoverContextIfNeeded({
    config,
    conversationId: "c1",
    conversationDir,
    memoryDir: config.memoryDir,
    workspaceRoot: root,
    actorUserId: 7,
    username: "alice",
    latestUserInput: "你还记得我们前面聊过的上下文恢复策略吗？",
    runtimeHistoryLength: 3,
    maxHistoryMessages: config.context.maxHistoryMessages,
    createCompletion: async () => {
      completionCalls += 1
      return "NONE"
    },
  })

  assert.equal(second.cached, true)
  assert.match(second.recoveredContext, /长期上下文恢复机制/)
  assert.equal(completionCalls, 1)
})

test("recoverContextIfNeeded ignores progress telegram entries in tail candidate", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-recovery-"))
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c2")
  mkdirSync(join(conversationDir, "context"), { recursive: true })

  recordIncomingTelegramMessage({
    conversationDir,
    conversationId: "c2",
    kind: "conversation",
    message: {
      message_id: 201,
      date: Date.parse("2026-03-12T00:00:00.000Z") / 1000,
      text: "继续上次的话题",
      chat: { id: 101, type: "private" },
      from: { id: 7, username: "alice", first_name: "Alice" },
    },
  })
  recordOutgoingTelegramMessages({
    conversationDir,
    conversationId: "c2",
    kind: "progress",
    sendResult: [
      {
        message_id: 202,
        date: Date.parse("2026-03-12T00:00:05.000Z") / 1000,
        text: "正在调用工具：Read",
        chat: { id: 101, type: "private" },
        from: { id: 999, username: "testbot" },
      },
    ],
  })

  await recoverContextIfNeeded({
    config,
    conversationId: "c2",
    conversationDir,
    memoryDir: config.memoryDir,
    workspaceRoot: root,
    actorUserId: 7,
    username: "alice",
    latestUserInput: "继续上次的话题",
    runtimeHistoryLength: 1,
    maxHistoryMessages: config.context.maxHistoryMessages,
    createCompletion: async (messages) => {
      const prompt = messages.map((message) => String(message.content || "")).join("\n")
      assert.doesNotMatch(prompt, /正在调用工具：Read/)
      return "NONE"
    },
  })
})
