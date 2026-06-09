import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"

export type ScheduledTaskStatus =
  | "pending"
  | "running"
  | "triggered"
  | "completed"
  | "archived"
  | "deleted"

export type ScheduledTaskTriggerMode = "llm" | "direct"

export interface ScheduledTask {
  id: string
  sessionId: string
  title: string
  instructions: string
  dueAt: string
  status: ScheduledTaskStatus
  triggerMode: ScheduledTaskTriggerMode
  directReply?: string
  createdAt: string
  updatedAt: string
  triggeredAt?: string
  completedAt?: string
  archivedAt?: string
  deletedAt?: string
  lastAttemptAt?: string
  triggerAttempts: number
  retryAfter?: string
  lastError?: string
}

interface ScheduledTaskFile {
  schemaVersion: string
  sessionId: string
  updatedAt: string
  tasks: ScheduledTask[]
}

export interface ScheduledTaskRef {
  sessionId: string
  sessionDir: string
  task: ScheduledTask
}

const TASK_SCHEMA_VERSION = "1.0.0"

function getTaskPaths(sessionDir: string) {
  return {
    tasksFile: resolve(sessionDir, "tasks.json"),
    todoFile: resolve(sessionDir, "TODO.md"),
  }
}

function createEmptyTaskFile(sessionId: string): ScheduledTaskFile {
  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    sessionId,
    updatedAt: new Date().toISOString(),
    tasks: [],
  }
}

function normalizeDateInput(raw: string) {
  return raw.trim()
}

function normalizeTaskText(raw: string) {
  return raw.trim().replace(/\s+/g, " ").toLowerCase()
}

function mergeUniqueText(...values: Array<string | undefined>) {
  const parts = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
  if (!parts.length) return undefined
  const unique: string[] = []
  for (const part of parts) {
    if (!unique.includes(part)) {
      unique.push(part)
    }
  }
  return unique.join("\n\n")
}

function parseDueAt(raw: string) {
  const normalized = normalizeDateInput(raw)
  if (!normalized) {
    throw new Error("dueAt 必填，且必须是 ISO 8601 日期时间")
  }
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("dueAt 无法解析，请使用 ISO 8601 日期时间")
  }
  return parsed
}

function assertFutureDate(date: Date) {
  if (date.getTime() <= Date.now()) {
    throw new Error("定时任务必须安排在未来时间")
  }
}

function readTaskFile(
  sessionDir: string,
  sessionId: string,
): ScheduledTaskFile {
  const paths = getTaskPaths(sessionDir)
  if (!existsSync(paths.tasksFile)) {
    return createEmptyTaskFile(sessionId)
  }
  try {
    const parsed = JSON.parse(readFileSync(paths.tasksFile, "utf-8")) as {
      schemaVersion?: string
      sessionId?: string
      updatedAt?: string
      tasks?: ScheduledTask[]
    }
    return {
      schemaVersion: parsed.schemaVersion || TASK_SCHEMA_VERSION,
      sessionId: parsed.sessionId || sessionId,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    }
  } catch {
    return createEmptyTaskFile(sessionId)
  }
}

function buildTaskLine(task: ScheduledTask) {
  const base = `- [${task.status === "completed" ? "x" : " "}] \`${task.id}\` ${task.dueAt} ${task.title}`.trim()
  const details = [
    `status: ${task.status}`,
    `triggerMode: ${task.triggerMode}`,
    task.instructions ? `instructions: ${task.instructions}` : "",
    task.directReply ? `directReply: ${task.directReply}` : "",
    task.retryAfter ? `retryAfter: ${task.retryAfter}` : "",
    task.lastError ? `lastError: ${task.lastError}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  return details ? `${base}\n${details}` : base
}

function renderTodoMarkdown(sessionId: string, tasks: ScheduledTask[]) {
  const groups: Array<{
    title: string
    statuses: ScheduledTaskStatus[]
    items: ScheduledTask[]
  }> = [
    {
      title: "Active",
      statuses: ["pending", "running", "triggered"],
      items: [],
    },
    {
      title: "Completed",
      statuses: ["completed"],
      items: [],
    },
    {
      title: "Archived",
      statuses: ["archived"],
      items: [],
    },
  ]

  tasks.forEach((task) => {
    const group = groups.find((entry) => entry.statuses.includes(task.status))
    if (group) {
      group.items.push(task)
    }
  })

  const sections = groups.map((group) => {
    const body = group.items.length
      ? group.items
          .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
          .map((task) => buildTaskLine(task))
          .join("\n\n")
      : "暂无任务。"
    return `## ${group.title}\n\n${body}`
  })

  return [
    `# TODO (${sessionId})`,
    "",
    "> This file is generated from tasks.json. Query tasks here if needed, but mutate them through task tools or by asking the bot.",
    "",
    `Updated at: ${new Date().toISOString()}`,
    "",
    ...sections,
    "",
  ].join("\n")
}

function writeTaskFile(
  sessionDir: string,
  sessionId: string,
  tasks: ScheduledTask[],
) {
  const paths = getTaskPaths(sessionDir)
  mkdirSync(sessionDir, { recursive: true })
  const payload: ScheduledTaskFile = {
    schemaVersion: TASK_SCHEMA_VERSION,
    sessionId,
    updatedAt: new Date().toISOString(),
    tasks,
  }
  writeFileSync(paths.tasksFile, JSON.stringify(payload, null, 2))
  writeFileSync(paths.todoFile, renderTodoMarkdown(sessionId, tasks))
  return payload
}

function saveTasks(
  sessionDir: string,
  sessionId: string,
  updater: (tasks: ScheduledTask[]) => ScheduledTask[],
) {
  const current = readTaskFile(sessionDir, sessionId)
  return writeTaskFile(
    sessionDir,
    sessionId,
    updater([...current.tasks]),
  )
}

function buildTaskSummary(task: ScheduledTask) {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    status: task.status,
    triggerMode: task.triggerMode,
    instructions: task.instructions,
    directReply: task.directReply || "",
    retryAfter: task.retryAfter || "",
    lastError: task.lastError || "",
  }
}

function buildTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isTaskActive(task: ScheduledTask) {
  return (
    task.status === "pending" ||
    task.status === "running" ||
    task.status === "triggered"
  )
}

function findSimilarActiveTask(
  tasks: ScheduledTask[],
  options: {
    title: string
    instructions?: string
    triggerMode: ScheduledTaskTriggerMode
  },
) {
  const normalizedTitle = normalizeTaskText(options.title)
  const normalizedInstructions = normalizeTaskText(options.instructions || "")
  return tasks.find((task) => {
    if (!isTaskActive(task)) return false
    if (task.triggerMode !== options.triggerMode) return false
    const sameTitle = normalizeTaskText(task.title) === normalizedTitle
    const sameInstructions =
      normalizedInstructions &&
      normalizeTaskText(task.instructions || "") === normalizedInstructions
    return sameTitle || sameInstructions
  })
}

export function ensureSessionTaskFiles(
  sessionDir: string,
  sessionId: string,
) {
  const current = readTaskFile(sessionDir, sessionId)
  writeTaskFile(sessionDir, sessionId, current.tasks)
}

export function listSessionTasks(options: {
  sessionDir: string
  sessionId: string
  includeDeleted?: boolean
}): ScheduledTask[] {
  const current = readTaskFile(options.sessionDir, options.sessionId)
  return current.tasks.filter((task) =>
    options.includeDeleted ? true : task.status !== "deleted",
  )
}

export function createScheduledTask(options: {
  sessionDir: string
  sessionId: string
  title: string
  dueAt: string
  instructions?: string
  triggerMode?: ScheduledTaskTriggerMode
  directReply?: string
}): ScheduledTask {
  const title = options.title.trim()
  if (!title) {
    throw new Error("title 必填")
  }
  const dueAt = parseDueAt(options.dueAt)
  assertFutureDate(dueAt)

  const createdAt = new Date().toISOString()
  const triggerMode = options.triggerMode === "direct" ? "direct" : "llm"
  const instructions = (options.instructions || "").trim()
  const directReply = (options.directReply || "").trim() || undefined
  const existing = findSimilarActiveTask(
    listSessionTasks({
      sessionDir: options.sessionDir,
      sessionId: options.sessionId,
    }),
    {
      title,
      instructions,
      triggerMode,
    },
  )
  if (existing) {
    return updateScheduledTask({
      sessionDir: options.sessionDir,
      sessionId: options.sessionId,
      taskId: existing.id,
      action: "edit",
      title,
      instructions,
      dueAt: dueAt.toISOString(),
      triggerMode,
      directReply,
    })
  }

  const task: ScheduledTask = {
    id: buildTaskId(),
    sessionId: options.sessionId,
    title,
    instructions,
    dueAt: dueAt.toISOString(),
    status: "pending",
    triggerMode,
    directReply,
    createdAt,
    updatedAt: createdAt,
    triggerAttempts: 0,
  }

  saveTasks(options.sessionDir, options.sessionId, (tasks) => [
    ...tasks,
    task,
  ])

  return task
}

export function updateScheduledTask(options: {
  sessionDir: string
  sessionId: string
  taskId: string
  action:
    | "postpone"
    | "complete"
    | "delete"
    | "archive"
    | "reopen"
    | "edit"
    | "merge"
  dueAt?: string
  title?: string
  instructions?: string
  triggerMode?: ScheduledTaskTriggerMode
  directReply?: string
  mergeTaskIds?: string[]
}): ScheduledTask {
  const taskId = options.taskId.trim()
  if (!taskId) {
    throw new Error("taskId 必填")
  }

  let updatedTask: ScheduledTask | undefined
  saveTasks(options.sessionDir, options.sessionId, (tasks) => {
    if (options.action === "merge") {
      const mergeTaskIds = Array.from(
        new Set(
          (options.mergeTaskIds || [])
            .map((id) => id.trim())
            .filter((id) => id && id !== taskId),
        ),
      )
      if (!mergeTaskIds.length) {
        throw new Error("mergeTaskIds 必填，且至少包含一个其他任务 ID")
      }
      const current = tasks.find((task) => task.id === taskId)
      if (!current) {
        throw new Error(`任务不存在: ${taskId}`)
      }
      const mergeTargets = tasks.filter((task) => mergeTaskIds.includes(task.id))
      if (mergeTargets.length !== mergeTaskIds.length) {
        const foundIds = new Set(mergeTargets.map((task) => task.id))
        const missingIds = mergeTaskIds.filter((id) => !foundIds.has(id))
        throw new Error(`待合并任务不存在: ${missingIds.join(", ")}`)
      }
      const now = new Date().toISOString()
      const nextPrimary: ScheduledTask = {
        ...current,
        updatedAt: now,
        instructions: mergeUniqueText(
          current.instructions,
          ...mergeTargets.map((task) => task.instructions),
        ) || "",
        directReply: mergeUniqueText(
          current.directReply,
          ...mergeTargets.map((task) => task.directReply),
        ) || undefined,
      }
      if (
        !nextPrimary.directReply &&
        mergeTargets.some((task) => task.triggerMode === "direct")
      ) {
        nextPrimary.triggerMode = "direct"
      }
      updatedTask = nextPrimary
      return tasks.map((task) => {
        if (task.id === taskId) return nextPrimary
        if (!mergeTaskIds.includes(task.id)) return task
        return {
          ...task,
          status: "deleted",
          deletedAt: now,
          updatedAt: now,
        }
      })
    }

    return tasks.map((task) => {
      if (task.id !== taskId) return task
      const now = new Date().toISOString()
      const next: ScheduledTask = {
        ...task,
        updatedAt: now,
      }

      if (options.action === "postpone") {
        const dueAt = parseDueAt(options.dueAt || "")
        assertFutureDate(dueAt)
        next.dueAt = dueAt.toISOString()
        next.status = "pending"
        next.retryAfter = undefined
        next.lastError = undefined
      }

      if (options.action === "complete") {
        next.status = "completed"
        next.completedAt = now
      }

      if (options.action === "archive") {
        next.status = "archived"
        next.archivedAt = now
      }

      if (options.action === "delete") {
        next.status = "deleted"
        next.deletedAt = now
      }

      if (options.action === "reopen") {
        next.status = "pending"
        next.retryAfter = undefined
        next.lastError = undefined
      }

      if (options.action === "edit") {
        if (typeof options.title === "string" && options.title.trim()) {
          next.title = options.title.trim()
        }
        if (typeof options.instructions === "string") {
          next.instructions = options.instructions.trim()
        }
        if (typeof options.triggerMode === "string") {
          next.triggerMode = options.triggerMode
        }
        if (typeof options.directReply === "string") {
          next.directReply = options.directReply.trim() || undefined
        }
        if (typeof options.dueAt === "string" && options.dueAt.trim()) {
          const dueAt = parseDueAt(options.dueAt)
          assertFutureDate(dueAt)
          next.dueAt = dueAt.toISOString()
        }
      }

      updatedTask = next
      return next
    })
  })

  if (!updatedTask) {
    throw new Error(`任务不存在: ${taskId}`)
  }

  return updatedTask
}

export function beginScheduledTaskRun(options: {
  sessionDir: string
  sessionId: string
  taskId: string
  now?: Date
}): ScheduledTask | null {
  const now = options.now || new Date()
  let updatedTask: ScheduledTask | undefined
  saveTasks(options.sessionDir, options.sessionId, (tasks) =>
    tasks.map((task) => {
      if (task.id !== options.taskId) return task
      const retryAfter = task.retryAfter ? new Date(task.retryAfter).getTime() : 0
      if (
        task.status !== "pending" ||
        new Date(task.dueAt).getTime() > now.getTime() ||
        (retryAfter && retryAfter > now.getTime())
      ) {
        return task
      }
      updatedTask = {
        ...task,
        status: "running",
        updatedAt: now.toISOString(),
        lastAttemptAt: now.toISOString(),
        triggerAttempts: task.triggerAttempts + 1,
      }
      return updatedTask
    }),
  )
  return updatedTask || null
}

export function finishScheduledTaskRun(options: {
  sessionDir: string
  sessionId: string
  taskId: string
  status: "triggered" | "completed"
}): ScheduledTask {
  let updatedTask: ScheduledTask | undefined
  saveTasks(options.sessionDir, options.sessionId, (tasks) =>
    tasks.map((task) => {
      if (task.id !== options.taskId) return task
      const now = new Date().toISOString()
      updatedTask = {
        ...task,
        status: options.status,
        updatedAt: now,
        triggeredAt: now,
        retryAfter: undefined,
        lastError: undefined,
        ...(options.status === "completed" ? { completedAt: now } : {}),
      }
      return updatedTask
    }),
  )
  if (!updatedTask) {
    throw new Error(`任务不存在: ${options.taskId}`)
  }
  return updatedTask
}

export function failScheduledTaskRun(options: {
  sessionDir: string
  sessionId: string
  taskId: string
  error: string
  baseDelayMs?: number
  maxDelayMs?: number
}): ScheduledTask {
  let updatedTask: ScheduledTask | undefined
  saveTasks(options.sessionDir, options.sessionId, (tasks) =>
    tasks.map((task) => {
      if (task.id !== options.taskId) return task
      const attempts = Math.max(1, task.triggerAttempts || 1)
      const baseDelayMs = Math.max(1000, options.baseDelayMs ?? 60_000)
      const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 15 * 60_000)
      const retryDelayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempts - 1))
      const retryAfter = new Date(Date.now() + retryDelayMs).toISOString()
      updatedTask = {
        ...task,
        status: "pending",
        updatedAt: new Date().toISOString(),
        retryAfter,
        lastError: options.error,
      }
      return updatedTask
    }),
  )
  if (!updatedTask) {
    throw new Error(`任务不存在: ${options.taskId}`)
  }
  return updatedTask
}

export function formatTasksForTool(tasks: ScheduledTask[]) {
  return JSON.stringify(
    tasks.map((task) => buildTaskSummary(task)),
    null,
    2,
  )
}

export function formatTasksForChat(tasks: ScheduledTask[]) {
  if (!tasks.length) {
    return "当前会话没有任务。"
  }

  return tasks
    .filter((task) => task.status !== "deleted")
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .map((task) => {
      return [
        `- ${task.id} | ${task.status} | ${task.dueAt}`,
        `  标题: ${task.title}`,
        task.instructions ? `  说明: ${task.instructions}` : "",
        `  模式: ${task.triggerMode}`,
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n")
}

export function renderDirectTaskReply(task: ScheduledTask) {
  return (
    task.directReply ||
    [
      `定时任务提醒：${task.title}`,
      task.instructions ? "" : "",
      task.instructions || "",
    ]
      .filter(Boolean)
      .join("\n")
  )
}

export function listDueScheduledTasks(options: {
  sessionsDir: string
  now?: Date
  limit?: number
}): ScheduledTaskRef[] {
  const now = options.now || new Date()
  const results: ScheduledTaskRef[] = []
  let entries: string[] = []

  try {
    entries = readdirSync(options.sessionsDir)
  } catch {
    return results
  }

  entries.forEach((entry) => {
    const sessionDir = resolve(options.sessionsDir, entry)
    let stat
    try {
      stat = statSync(sessionDir)
    } catch {
      return
    }
    if (!stat.isDirectory()) return
    const tasks = listSessionTasks({
      sessionDir,
      sessionId: entry,
      includeDeleted: false,
    })
    tasks.forEach((task) => {
      const dueAt = new Date(task.dueAt).getTime()
      const retryAfter = task.retryAfter ? new Date(task.retryAfter).getTime() : 0
      if (task.status !== "pending") return
      if (Number.isNaN(dueAt) || dueAt > now.getTime()) return
      if (retryAfter && retryAfter > now.getTime()) return
      results.push({
        sessionId: entry,
        sessionDir,
        task,
      })
    })
  })

  return results
    .sort((left, right) => left.task.dueAt.localeCompare(right.task.dueAt))
    .slice(0, Math.max(1, options.limit ?? 20))
}
