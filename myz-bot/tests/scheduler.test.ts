import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureConversationDir,
  saveMetadata,
} from "../src/conversations"
import {
  processDueScheduledTasks,
} from "../src/scheduler"
import { createScheduledTask, listConversationTasks } from "../src/tasks"
import {
  recordIncomingTelegramMessage,
  recordOutgoingTelegramMessages,
} from "../src/telegramHistory"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(root: string) {
  return createRuntimeConfig(root, {
    channels: {
      telegram: {
        adminUsers: ["admin"],
      },
    },
    scheduler: {
      failureRetryBaseDelayMs: 1000,
    },
  })
}

test("processDueScheduledTasks sends direct reminders and marks task triggered", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-scheduler-"))
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  saveMetadata(conversationDir, {
    schemaVersion: "1.0.0",
    conversationId: "c1",
    chatId: 42,
    userId: 7,
    username: "admin",
    firstName: "A",
    lastName: "B",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const task = createScheduledTask({
    conversationDir,
    conversationId: "c1",
    title: "提醒查看日报",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    triggerMode: "direct",
    directReply: "这是你的日报提醒",
  })

  const tasksFile = join(conversationDir, "tasks.json")
  const parsed = JSON.parse(readFileSync(tasksFile, "utf-8")) as {
    tasks: Array<{ id: string; dueAt: string }>
  }
  parsed.tasks = parsed.tasks.map((entry) =>
    entry.id === task.id
      ? { ...entry, dueAt: new Date(Date.now() - 1_000).toISOString() }
      : entry,
  )
  writeFileSync(tasksFile, JSON.stringify(parsed, null, 2))

  const sent: Array<{ chatId: number; text: string; options?: Record<string, unknown> }> = []
  const telegram = {
    sendMessage: async (
      chatId: number,
      text: string,
      options?: Record<string, unknown>,
    ) => {
      sent.push({ chatId, text, options })
      return { ok: true }
    },
  } as any

  await processDueScheduledTasks({
    config,
    telegram,
  })

  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.chatId, 42)
  assert.match(String(sent[0]?.text || ""), /日报提醒/)

  const tasks = listConversationTasks({
    conversationDir,
    conversationId: "c1",
  })
  assert.equal(tasks[0]?.status, "triggered")
})
