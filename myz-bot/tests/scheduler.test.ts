import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureSessionDir,
  saveSessionMetadata,
} from "../src/sessions"
import {
  processDueScheduledTasks,
} from "../src/scheduler"
import { createScheduledTask, listSessionTasks } from "../src/tasks"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(root: string) {
  return createRuntimeConfig(root, {
    scheduler: {
      failureRetryBaseDelayMs: 1000,
    },
  })
}

test("processDueScheduledTasks sends direct reminders and marks task triggered", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-scheduler-"))
  const config = createConfig(root)
  const sessionDir = ensureSessionDir(config.sessionsDir, "c1")
  saveSessionMetadata(sessionDir, {
    schemaVersion: "1.0.0",
    sessionId: "c1",
    workspaceId: config.workspaceId,
    chatId: 42,
    userId: 7,
    username: "admin",
    firstName: "A",
    lastName: "B",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    status: "active",
  })

  const task = createScheduledTask({
    sessionDir,
    sessionId: "c1",
    title: "提醒查看日报",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    triggerMode: "direct",
    directReply: "这是你的日报提醒",
  })

  const tasksFile = join(sessionDir, "tasks.json")
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
  const channel = {
    sendMessage: async (
      chatId: number,
      text: string,
      options?: { replyToMessageId?: number; messageThreadId?: number },
    ) => {
      sent.push({ chatId, text, options })
      return [] as never[]
    },
    sendChatAction: async () => true,
    setMessageReaction: async () => true,
  }

  await processDueScheduledTasks({
    config,
    channel,
  })

  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.chatId, 42)
  assert.match(String(sent[0]?.text || ""), /日报提醒/)

  const tasks = listSessionTasks({
    sessionDir,
    sessionId: "c1",
  })
  assert.equal(tasks[0]?.status, "triggered")
})
