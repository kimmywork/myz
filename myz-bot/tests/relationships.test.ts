import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Message } from "@myz/ai-core/types"
import type { BotRuntimeConfig } from "../src/config"
import { ensureConversationDir, saveMetadata } from "../src/conversations"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import {
  listKnownContacts,
  reflectRelationshipRecord,
  renderRelationshipContext,
  resolveKnownContact,
  touchRelationshipRecord,
} from "../src/relationships"

function createConfig(root: string): BotRuntimeConfig {
  return createRuntimeConfig(root)
}

function createTranscript(messages: Array<Partial<Message>>): Message[] {
  return messages.map((message, index) => ({
    schemaVersion: "1.0.0",
    id: `msg-${index + 1}`,
    conversationId: "c1",
    role: "user",
    content: "",
    timestamp: new Date(1_700_000_000_000 + index * 1000).toISOString(),
    ...message,
  }))
}

test("relationship records are rendered for the current user", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-relationships-"))
  touchRelationshipRecord({
    workspaceRoot: root,
    conversationId: "c1",
    scope: "private",
    chatId: 101,
    actorUserId: 7,
    username: "kimmy",
    firstName: "Kimmy",
    displayName: "Kimmy (@kimmy)",
  })

  const updated = renderRelationshipContext({
    workspaceRoot: root,
    actorUserId: 7,
    username: "kimmy",
  })
  assert.match(updated, /主动联系边界/)
})

test("relationship reflection updates summaries and aliases", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-relationships-"))
  const config = createConfig(root)
  const record = await reflectRelationshipRecord({
    config,
    workspaceRoot: root,
    conversationsDir: config.conversationsDir,
    conversationId: "c1",
    actorUserId: 7,
    chatId: 101,
    username: "kimmy",
    firstName: "Kimmy",
    displayName: "Kimmy (@kimmy)",
    scope: "private",
    messages: createTranscript([
      { role: "assistant", content: "以后私聊里我就叫你 Kimmy。" },
      { role: "user", content: "你太懂我了，这个称呼我很喜欢。" },
    ]),
    createCompletion: async () =>
      JSON.stringify({
        shouldUpdate: true,
        relationshipSummary: "对方把 bot 当作可信赖的私聊助手。",
        impressionSummary: "重视边界感，也会给出明确的正向反馈。",
        aliases: ["Kimmy"],
        messagingPolicy: "cautious",
      }),
  })
  assert.ok(record)
  assert.equal(record?.aliases.includes("Kimmy"), true)
  assert.match(record?.relationshipSummary || "", /可信赖/)
})

test("known contacts merge metadata and relationship aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-relationships-"))
  const conversationsDir = join(root, "conversations")
  const conversationDir = ensureConversationDir(conversationsDir, "101-7")
  touchRelationshipRecord({
    workspaceRoot: root,
    conversationId: "101-7",
    scope: "private",
    chatId: 101,
    actorUserId: 7,
    username: "kimmy",
    firstName: "Kimmy",
    displayName: "Kimmy (@kimmy)",
  })
  saveMetadata(conversationDir, {
    schemaVersion: "1.0.0",
    conversationId: "101-7",
    chatId: 101,
    userId: 7,
    scope: "private",
    chatType: "private",
    username: "kimmy",
    firstName: "Kimmy",
    lastName: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  const contacts = listKnownContacts({
    workspaceRoot: root,
    conversationsDir,
  })
  assert.equal(contacts.length, 1)
  assert.equal(resolveKnownContact({
    workspaceRoot: root,
    conversationsDir,
    target: "kimmy",
  })?.chatId, 101)
})

test("relationship reflection compacts summaries and archives raw reflection events", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-relationships-"))
  const config = createConfig(root)
  const longSummary = "很熟悉而且边界稳定。".repeat(40)
  const longImpression = "表达直接，但会给明确反馈。".repeat(40)

  for (let index = 0; index < 205; index += 1) {
    await reflectRelationshipRecord({
      config,
      workspaceRoot: root,
      conversationsDir: config.conversationsDir,
      conversationId: `c${index}`,
      actorUserId: 7,
      chatId: 101,
      username: "kimmy",
      firstName: "Kimmy",
      displayName: "Kimmy (@kimmy)",
      scope: "private",
      messages: createTranscript([
        { role: "assistant", content: "我知道你的习惯了。" },
        { role: "user", content: "嗯，这样交流就挺好。" },
      ]),
      createCompletion: async () =>
        JSON.stringify({
          shouldUpdate: true,
          relationshipSummary: longSummary,
          impressionSummary: longImpression,
          aliases: ["Kimmy"],
          messagingPolicy: "cautious",
        }),
    })
  }

  const context = renderRelationshipContext({
    workspaceRoot: root,
    actorUserId: 7,
    username: "kimmy",
  })
  assert.ok(context.length < 1200)

  const reflectionFile = join(root, "relationships", "reflections.jsonl")
  const archiveDir = join(root, "relationships", "archive")
  const activeLines = readFileSync(reflectionFile, "utf-8").trim().split(/\r?\n/).filter(Boolean)

  assert.equal(activeLines.length, 200)
  assert.equal(existsSync(archiveDir), true)
  assert.ok(
    readdirSync(archiveDir).some((name) => name.startsWith("relationship-reflections-") && name.endsWith(".jsonl")),
  )
})
