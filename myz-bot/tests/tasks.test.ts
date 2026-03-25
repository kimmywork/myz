import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createScheduledTask,
  ensureConversationTaskFiles,
  listConversationTasks,
  updateScheduledTask,
} from "../src/tasks"

test("scheduled tasks are persisted and mirrored to TODO.md", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tasks-"))
  const conversationDir = join(root, "conversations", "c1")
  ensureConversationTaskFiles(conversationDir, "c1")

  const task = createScheduledTask({
    conversationDir,
    conversationId: "c1",
    title: "提醒交付文档",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    instructions: "检查 docs/track",
    triggerMode: "llm",
  })

  const tasks = listConversationTasks({
    conversationDir,
    conversationId: "c1",
  })

  assert.equal(existsSync(join(conversationDir, "tasks.json")), true)
  assert.equal(existsSync(join(conversationDir, "TODO.md")), true)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0]?.id, task.id)

  const todoContent = readFileSync(join(conversationDir, "TODO.md"), "utf-8")
  assert.match(todoContent, /提醒交付文档/)
  assert.match(todoContent, /Active/)
})

test("scheduled tasks support postpone and archive lifecycle", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tasks-"))
  const conversationDir = join(root, "conversations", "c2")
  ensureConversationTaskFiles(conversationDir, "c2")

  const task = createScheduledTask({
    conversationDir,
    conversationId: "c2",
    title: "提醒检查日志",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    triggerMode: "direct",
    directReply: "请看一下日志",
  })

  const postponed = updateScheduledTask({
    conversationDir,
    conversationId: "c2",
    taskId: task.id,
    action: "postpone",
    dueAt: new Date(Date.now() + 120_000).toISOString(),
  })
  assert.equal(postponed.status, "pending")

  const archived = updateScheduledTask({
    conversationDir,
    conversationId: "c2",
    taskId: task.id,
    action: "archive",
  })
  assert.equal(archived.status, "archived")

  const todoContent = readFileSync(join(conversationDir, "TODO.md"), "utf-8")
  assert.match(todoContent, /Archived/)
})

test("scheduled tasks support edit updates", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tasks-"))
  const conversationDir = join(root, "conversations", "c3")
  ensureConversationTaskFiles(conversationDir, "c3")

  const task = createScheduledTask({
    conversationDir,
    conversationId: "c3",
    title: "旧标题",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    instructions: "旧说明",
    triggerMode: "llm",
  })

  const updated = updateScheduledTask({
    conversationDir,
    conversationId: "c3",
    taskId: task.id,
    action: "edit",
    dueAt: new Date(Date.now() + 120_000).toISOString(),
    title: "新标题",
    instructions: "新说明",
  })

  assert.equal(updated.title, "新标题")
  assert.equal(updated.instructions, "新说明")
  assert.notEqual(updated.dueAt, task.dueAt)
})

test("creating a similar active task merges into the existing task instead of duplicating it", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tasks-"))
  const conversationDir = join(root, "conversations", "c4")
  ensureConversationTaskFiles(conversationDir, "c4")

  const first = createScheduledTask({
    conversationDir,
    conversationId: "c4",
    title: "每日新闻早报",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    instructions: "每天早上整理新闻",
    triggerMode: "llm",
  })

  const second = createScheduledTask({
    conversationDir,
    conversationId: "c4",
    title: "每日新闻早报",
    dueAt: new Date(Date.now() + 120_000).toISOString(),
    instructions: "每天早上整理新闻",
    triggerMode: "llm",
  })

  const tasks = listConversationTasks({
    conversationDir,
    conversationId: "c4",
  })

  assert.equal(tasks.length, 1)
  assert.equal(second.id, first.id)
  assert.equal(tasks[0]?.id, first.id)
  assert.equal(tasks[0]?.dueAt, second.dueAt)
})

test("scheduled tasks support explicit merge", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tasks-"))
  const conversationDir = join(root, "conversations", "c5")
  ensureConversationTaskFiles(conversationDir, "c5")

  const keep = createScheduledTask({
    conversationDir,
    conversationId: "c5",
    title: "每日股票日报",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    instructions: "跟踪 TME 和 MSFT",
    triggerMode: "llm",
  })

  const duplicate = createScheduledTask({
    conversationDir,
    conversationId: "c5",
    title: "每日下午股票日报",
    dueAt: new Date(Date.now() + 120_000).toISOString(),
    instructions: "跟踪 TME 和 MSFT，并标注异动",
    triggerMode: "llm",
  })

  const merged = updateScheduledTask({
    conversationDir,
    conversationId: "c5",
    taskId: keep.id,
    action: "merge",
    mergeTaskIds: [duplicate.id],
  })

  const tasks = listConversationTasks({
    conversationDir,
    conversationId: "c5",
    includeDeleted: true,
  })

  assert.equal(merged.id, keep.id)
  assert.match(merged.instructions, /跟踪 TME 和 MSFT/)
  assert.match(merged.instructions, /标注异动/)
  assert.equal(tasks.length, 2)
  assert.equal(tasks.find((task) => task.id === duplicate.id)?.status, "deleted")
})
