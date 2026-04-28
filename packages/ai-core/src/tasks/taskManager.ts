import { isRecord } from "@myz/shared/typeUtils"

export type TaskPlanStatus = "planning" | "executing" | "blocked" | "done"

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked"
export type TaskPriority = "low" | "medium" | "high"

export interface TaskItem {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  blockedBy: string[]
  blocks: string[]
  skills: string[]
  summary?: string
  notes: string[]
  outcome?: string
}

export interface TaskPlan {
  id: string
  status: TaskPlanStatus
  goal: string
  assumptions?: string[]
  summary?: string
  outcome?: string
  tasks: TaskItem[]
  currentTaskId: string | null
  createdAt: string
  updatedAt: string
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === "done") return "done"
  if (value === "in_progress") return "in_progress"
  if (value === "blocked") return "blocked"
  return "pending"
}

export function normalizeTaskPlanStatus(value: unknown): TaskPlanStatus {
  switch (value) {
    case "planning":
    case "executing":
    case "blocked":
    case "done":
      return value
    default:
      return "planning"
  }
}

export function normalizeTaskPriority(value: unknown): TaskPriority {
  return value === "high" ? "high" : value === "low" ? "low" : "medium"
}

export function normalizeTaskString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeTaskStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeTaskString(item))
    .filter(Boolean)
}

export function normalizeTaskNotes(value: unknown): string[] {
  const notes = normalizeTaskStringArray(value)
  return Array.from(new Set(notes))
}

function summarizeLegacyDeliverables(value: unknown) {
  if (!Array.isArray(value)) return { summary: "", notes: [] as string[] }
  const descriptions = value
    .map((item) => {
      const record = isRecord(item) ? item : {}
      return normalizeTaskString(record.description)
    })
    .filter(Boolean)
  return {
    summary: descriptions[0] || "",
    notes: descriptions.slice(1),
  }
}

function summarizeLegacyArtifacts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const record = isRecord(item) ? item : {}
      const type = normalizeTaskString(record.type)
      const payload = record.payload
      if (typeof payload === "string") {
        return [type || "artifact", payload].filter(Boolean).join(": ")
      }
      if (isRecord(payload)) {
        const detail =
          normalizeTaskString(payload.title) ||
          normalizeTaskString(payload.text) ||
          normalizeTaskString(payload.url) ||
          normalizeTaskString(payload.href)
        return [type || "artifact", detail].filter(Boolean).join(": ")
      }
      return type
    })
    .map((item) => item.trim())
    .filter(Boolean)
}

function rebuildTaskBlocks(plan: TaskPlan) {
  plan.tasks.forEach((task) => {
    task.blocks = []
  })
  plan.tasks.forEach((task) => {
    task.blockedBy.forEach((blockedId) => {
      const blocker = plan.tasks.find((item) => item.id === blockedId)
      if (!blocker) return
      if (!blocker.blocks.includes(task.id)) {
        blocker.blocks.push(task.id)
      }
    })
  })
}

function breakCyclicDependencies(plan: TaskPlan) {
  const taskMap = new Map(plan.tasks.map((task) => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const dfs = (taskId: string) => {
    if (visited.has(taskId) || visiting.has(taskId)) return
    const task = taskMap.get(taskId)
    if (!task) return
    visiting.add(taskId)
    const deps = Array.isArray(task.blockedBy) ? [...task.blockedBy] : []
    deps.forEach((dep) => {
      if (!taskMap.has(dep)) return
      if (visiting.has(dep)) {
        task.blockedBy = task.blockedBy.filter((id) => id !== dep)
        return
      }
      dfs(dep)
    })
    task.blockedBy = Array.from(new Set(task.blockedBy))
    visiting.delete(taskId)
    visited.add(taskId)
  }

  plan.tasks.forEach((task) => dfs(task.id))
}

function resolveTaskDependencies(plan: TaskPlan) {
  const idSet = new Set(plan.tasks.map((task) => task.id))
  const indexMap = new Map<number, string>()
  const titleCount = new Map<string, number>()
  plan.tasks.forEach((task, index) => {
    indexMap.set(index + 1, task.id)
    const title = normalizeTaskString(task.title).toLowerCase()
    if (!title) return
    titleCount.set(title, (titleCount.get(title) || 0) + 1)
  })
  const titleMap = new Map<string, string>()
  plan.tasks.forEach((task) => {
    const title = normalizeTaskString(task.title).toLowerCase()
    if (!title) return
    if (titleCount.get(title) === 1) {
      titleMap.set(title, task.id)
    }
  })

  const resolveRef = (value: string) => {
    const raw = normalizeTaskString(value)
    if (!raw) return ""
    if (idSet.has(raw)) return raw
    const lowered = raw.toLowerCase()
    let index: number | null = null
    if (/^#?\d+$/.test(lowered)) {
      index = Number.parseInt(lowered.replace(/^#/, ""), 10)
    } else {
      const match = /^(task|t|step|任务|步骤)[-_ ]*(\d+)$/.exec(lowered)
      if (match) {
        index = Number.parseInt(match[2], 10)
      }
    }
    if (index && indexMap.has(index)) {
      return indexMap.get(index) || ""
    }
    if (titleMap.has(lowered)) {
      return titleMap.get(lowered) || ""
    }
    return ""
  }

  plan.tasks.forEach((task) => {
    task.blockedBy = Array.from(
      new Set(
        task.blockedBy
          .map((item) => resolveRef(item))
          .filter((id) => id && id !== task.id),
      ),
    )
    task.blocks = Array.from(
      new Set(
        task.blocks
          .map((item) => resolveRef(item))
          .filter((id) => id && id !== task.id),
      ),
    )
  })

  rebuildTaskBlocks(plan)
  breakCyclicDependencies(plan)
  rebuildTaskBlocks(plan)
}

export function isTaskBlocked(plan: TaskPlan, task: TaskItem) {
  if (!task.blockedBy.length) return false
  return task.blockedBy.some((id) => {
    const blocker = plan.tasks.find((item) => item.id === id)
    return Boolean(blocker && blocker.status !== "done")
  })
}

function applyTaskBlocking(plan: TaskPlan) {
  plan.tasks.forEach((task) => {
    if (task.status === "done") return
    const blocked = isTaskBlocked(plan, task)
    if (blocked && task.status !== "blocked") {
      task.status = "blocked"
    } else if (!blocked && task.status === "blocked") {
      task.status = "pending"
    }
  })
}

export function pickNextTask(plan: TaskPlan): TaskItem | null {
  const inProgress = plan.tasks.find(
    (task) => task.status === "in_progress" && !isTaskBlocked(plan, task),
  )
  if (inProgress) return inProgress

  const candidates = plan.tasks.filter(
    (task) => task.status === "pending" && !isTaskBlocked(plan, task),
  )
  if (!candidates.length) return null
  const priorityRank: Record<TaskPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  candidates.sort((a, b) => {
    const diff = priorityRank[a.priority] - priorityRank[b.priority]
    if (diff !== 0) return diff
    return plan.tasks.indexOf(a) - plan.tasks.indexOf(b)
  })
  return candidates[0]
}

function ensureCurrentTask(plan: TaskPlan) {
  applyTaskBlocking(plan)
  let current =
    typeof plan.currentTaskId === "string"
      ? plan.tasks.find((task) => task.id === plan.currentTaskId) || null
      : null
  if (current && (current.status === "done" || isTaskBlocked(plan, current))) {
    current = null
  }
  if (!current) {
    current = pickNextTask(plan)
  }
  if (current) {
    plan.currentTaskId = current.id
    if (plan.status === "executing" && current.status === "pending") {
      current.status = "in_progress"
    }
    return
  }
  plan.currentTaskId = null
}

export function computeTaskPlanStatus(plan: TaskPlan): TaskPlanStatus {
  if (!plan.tasks.length) return "planning"
  const allDone = plan.tasks.every((task) => task.status === "done")
  if (allDone) return "done"
  const hasActive = plan.tasks.some((task) => task.status === "in_progress")
  if (hasActive) return "executing"
  const hasRunnable = plan.tasks.some((task) => task.status === "pending")
  if (hasRunnable) {
    return plan.status === "planning" ? "planning" : "executing"
  }
  return "blocked"
}

export function normalizeTaskItemPayload(task: unknown): TaskItem {
  const item = isRecord(task) ? task : {}
  const legacyDeliverables = summarizeLegacyDeliverables(item.deliverables)
  const firstLegacyArtifactNotes = Array.isArray(item.deliverables)
    ? item.deliverables.flatMap((deliverable) => {
        const record = isRecord(deliverable) ? deliverable : {}
        return summarizeLegacyArtifacts(record.artifacts)
      })
    : []

  const summary =
    normalizeTaskString(item.summary) ||
    normalizeTaskString(item.description) ||
    legacyDeliverables.summary

  const notes = Array.from(
    new Set([
      ...normalizeTaskNotes(item.notes),
      ...legacyDeliverables.notes,
      ...firstLegacyArtifactNotes,
    ]),
  )

  return {
    id: normalizeTaskString(item.id) || generateId("task"),
    title: normalizeTaskString(item.title) || "未命名任务",
    status: normalizeTaskStatus(item.status),
    priority: normalizeTaskPriority(item.priority),
    blockedBy: normalizeTaskStringArray(item.blockedBy),
    blocks: normalizeTaskStringArray(item.blocks),
    skills: normalizeTaskStringArray(item.skills),
    ...(summary ? { summary } : {}),
    notes,
    ...(normalizeTaskString(item.outcome)
      ? { outcome: normalizeTaskString(item.outcome) }
      : {}),
  }
}

export function finalizeTaskPlan(plan: TaskPlan) {
  resolveTaskDependencies(plan)
  applyTaskBlocking(plan)
  ensureCurrentTask(plan)
  plan.status = computeTaskPlanStatus(plan)
  return plan
}

export function createTaskPlan(options: {
  id?: string
  status?: TaskPlanStatus
  goal?: string
  originalUserRequest?: string
  assumptions?: unknown
  summary?: string
  outcome?: string
  tasks?: Array<unknown>
  currentTaskId?: string | null
  createdAt?: string
  updatedAt?: string
}) {
  const now = new Date().toISOString()
  const plan: TaskPlan = {
    id: normalizeTaskString(options.id) || generateId("plan"),
    status: normalizeTaskPlanStatus(options.status || "planning"),
    goal:
      normalizeTaskString(options.goal) ||
      normalizeTaskString(options.originalUserRequest),
    assumptions: normalizeTaskStringArray(options.assumptions),
    ...(normalizeTaskString(options.summary)
      ? { summary: normalizeTaskString(options.summary) }
      : {}),
    ...(normalizeTaskString(options.outcome)
      ? { outcome: normalizeTaskString(options.outcome) }
      : {}),
    tasks: Array.isArray(options.tasks)
      ? options.tasks.map(normalizeTaskItemPayload)
      : [],
    currentTaskId: normalizeTaskString(options.currentTaskId) || null,
    createdAt: normalizeTaskString(options.createdAt) || now,
    updatedAt: normalizeTaskString(options.updatedAt) || now,
  }
  return finalizeTaskPlan(plan)
}

export function patchTaskPlan(
  plan: TaskPlan,
  patch: {
    status?: TaskPlanStatus
    currentTaskId?: string | null
    goal?: string
    assumptions?: unknown
    summary?: string
    outcome?: string
  },
) {
  if (typeof patch.status !== "undefined") {
    plan.status = normalizeTaskPlanStatus(patch.status)
  }
  if (typeof patch.currentTaskId !== "undefined") {
    plan.currentTaskId =
      typeof patch.currentTaskId === "string" && patch.currentTaskId.trim()
        ? patch.currentTaskId.trim()
        : patch.currentTaskId === null
          ? null
          : plan.currentTaskId
  }
  if (typeof patch.goal === "string") {
    plan.goal = patch.goal.trim()
  }
  if (typeof patch.assumptions !== "undefined") {
    plan.assumptions = normalizeTaskStringArray(patch.assumptions)
  }
  if (typeof patch.summary === "string") {
    const next = patch.summary.trim()
    if (next) {
      plan.summary = next
    } else {
      delete plan.summary
    }
  }
  if (typeof patch.outcome === "string") {
    const next = patch.outcome.trim()
    if (next) {
      plan.outcome = next
    } else {
      delete plan.outcome
    }
  }
  return finalizeTaskPlan(plan)
}

export function patchTaskItem(
  plan: TaskPlan,
  options: {
    taskId: string
    patch: Partial<TaskItem> & { appendNote?: string }
  },
) {
  const task = plan.tasks.find((item) => item.id === options.taskId)
  if (!task) return null

  if (typeof options.patch.title === "string") {
    task.title = options.patch.title.trim() || task.title
  }
  if (typeof options.patch.status !== "undefined") {
    task.status = normalizeTaskStatus(options.patch.status)
  }
  if (typeof options.patch.priority !== "undefined") {
    task.priority = normalizeTaskPriority(options.patch.priority)
  }
  if (typeof options.patch.skills !== "undefined") {
    task.skills = normalizeTaskStringArray(options.patch.skills)
  }
  if (typeof options.patch.blockedBy !== "undefined") {
    task.blockedBy = normalizeTaskStringArray(options.patch.blockedBy)
  }
  if (typeof options.patch.blocks !== "undefined") {
    task.blocks = normalizeTaskStringArray(options.patch.blocks)
  }
  if (typeof options.patch.summary === "string") {
    const next = options.patch.summary.trim()
    if (next) {
      task.summary = next
    } else {
      delete task.summary
    }
  }
  if (typeof options.patch.outcome === "string") {
    const next = options.patch.outcome.trim()
    if (next) {
      task.outcome = next
    } else {
      delete task.outcome
    }
  }
  if (typeof options.patch.notes !== "undefined") {
    task.notes = normalizeTaskNotes(options.patch.notes)
  }
  if (typeof options.patch.appendNote === "string") {
    const note = options.patch.appendNote.trim()
    if (note && !task.notes.includes(note)) {
      task.notes = [...task.notes, note]
    }
  }

  finalizeTaskPlan(plan)
  return task
}

export function setTaskStatus(
  plan: TaskPlan,
  options: { taskId: string; status?: TaskStatus },
) {
  const task = plan.tasks.find((item) => item.id === options.taskId)
  if (!task) return null
  if (typeof options.status !== "undefined") {
    task.status = normalizeTaskStatus(options.status)
  }
  finalizeTaskPlan(plan)
  return task
}

export function completeTaskPlan(
  plan: TaskPlan,
  options: { summary?: string; outcome?: string } = {},
) {
  plan.tasks.forEach((task) => {
    task.status = "done"
  })
  plan.currentTaskId = null
  plan.status = "done"
  if (typeof options.summary === "string" && options.summary.trim()) {
    plan.summary = options.summary.trim()
  }
  if (typeof options.outcome === "string" && options.outcome.trim()) {
    plan.outcome = options.outcome.trim()
  }
  return finalizeTaskPlan(plan)
}

export function listUnblockedTasksFromPlan(
  plan: TaskPlan,
  status?: TaskStatus[],
) {
  finalizeTaskPlan(plan)
  const statuses = Array.isArray(status) ? status : []
  return plan.tasks.filter((task) => {
    if (task.status === "blocked") return false
    if (!statuses.length) return task.status !== "done"
    return statuses.includes(task.status)
  })
}

export function normalizeTaskPlanPayload(value: unknown): TaskPlan | null {
  if (!isRecord(value)) return null
  return createTaskPlan(value)
}

export function getCurrentTask(plan?: TaskPlan | null): TaskItem | null {
  if (!plan || !plan.tasks.length) return null
  const currentId =
    typeof plan.currentTaskId === "string" ? plan.currentTaskId : ""
  const byId = currentId
    ? plan.tasks.find((task) => task.id === currentId)
    : null
  if (byId && byId.status !== "done" && !isTaskBlocked(plan, byId)) {
    return byId
  }
  const inProgress = plan.tasks.find(
    (task) => task.status === "in_progress" && !isTaskBlocked(plan, task),
  )
  if (inProgress) return inProgress
  const nextPending = plan.tasks.find(
    (task) => task.status !== "done" && !isTaskBlocked(plan, task),
  )
  return nextPending || plan.tasks[0] || null
}
