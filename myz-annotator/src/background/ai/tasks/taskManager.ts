import {
  getConversation,
  updateConversationMetadata,
} from "@/sidepanel/aiStorage"
import { isRecord } from "@myz/shared/typeUtils"

export type TaskPlanStatus = "planning" | "executing" | "blocked" | "done"

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked"
export type TaskPriority = "low" | "medium" | "high"
export type TaskOwner =
  | "planner"
  | "executor"
  | "research"
  | "automation"
  | "review"
export type TaskCategory = "quick" | "research" | "automation" | "reasoning"

export interface TaskItem {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  owner: TaskOwner
  blockedBy: string[]
  blocks: string[]
  category: TaskCategory
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

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === "done") return "done"
  if (value === "in_progress") return "in_progress"
  if (value === "blocked") return "blocked"
  return "pending"
}

function normalizePlanStatus(value: unknown): TaskPlanStatus {
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

function normalizePriority(value: unknown): TaskPriority {
  return value === "high" ? "high" : value === "low" ? "low" : "medium"
}

function normalizeOwner(value: unknown): TaskOwner {
  switch (value) {
    case "planner":
    case "executor":
    case "research":
    case "automation":
    case "review":
      return value
    default:
      return "executor"
  }
}

function normalizeCategory(value: unknown): TaskCategory {
  switch (value) {
    case "research":
    case "automation":
    case "reasoning":
      return value
    default:
      return "quick"
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
}

function normalizeNotes(value: unknown): string[] {
  const notes = normalizeStringArray(value)
  return Array.from(new Set(notes))
}

function summarizeLegacyDeliverables(value: unknown) {
  if (!Array.isArray(value)) return { summary: "", notes: [] as string[] }
  const descriptions = value
    .map((item) => {
      const record = isRecord(item) ? item : {}
      return normalizeString(record.description)
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
      const type = normalizeString(record.type)
      const payload = record.payload
      if (typeof payload === "string") {
        return [type || "artifact", payload].filter(Boolean).join(": ")
      }
      if (isRecord(payload)) {
        const detail =
          normalizeString(payload.title) ||
          normalizeString(payload.text) ||
          normalizeString(payload.url) ||
          normalizeString(payload.href)
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
    const title = normalizeString(task.title).toLowerCase()
    if (!title) return
    titleCount.set(title, (titleCount.get(title) || 0) + 1)
  })
  const titleMap = new Map<string, string>()
  plan.tasks.forEach((task) => {
    const title = normalizeString(task.title).toLowerCase()
    if (!title) return
    if (titleCount.get(title) === 1) {
      titleMap.set(title, task.id)
    }
  })

  const resolveRef = (value: string) => {
    const raw = normalizeString(value)
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

function isTaskBlocked(plan: TaskPlan, task: TaskItem) {
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

function pickNextTask(plan: TaskPlan): TaskItem | null {
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

function computePlanStatus(plan: TaskPlan): TaskPlanStatus {
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

function normalizeTaskItem(task: unknown): TaskItem {
  const item = isRecord(task) ? task : {}
  const legacyDeliverables = summarizeLegacyDeliverables(item.deliverables)
  const firstLegacyArtifactNotes = Array.isArray(item.deliverables)
    ? item.deliverables.flatMap((deliverable) => {
        const record = isRecord(deliverable) ? deliverable : {}
        return summarizeLegacyArtifacts(record.artifacts)
      })
    : []

  const summary =
    normalizeString(item.summary) ||
    normalizeString(item.description) ||
    legacyDeliverables.summary

  const notes = Array.from(
    new Set([
      ...normalizeNotes(item.notes),
      ...legacyDeliverables.notes,
      ...firstLegacyArtifactNotes,
    ]),
  )

  return {
    id: normalizeString(item.id) || generateId("task"),
    title: normalizeString(item.title) || "未命名任务",
    status: normalizeTaskStatus(item.status),
    priority: normalizePriority(item.priority),
    owner: normalizeOwner(item.owner),
    blockedBy: normalizeStringArray(item.blockedBy),
    blocks: normalizeStringArray(item.blocks),
    category: normalizeCategory(item.category),
    skills: normalizeStringArray(item.skills),
    ...(summary ? { summary } : {}),
    notes,
    ...(normalizeString(item.outcome)
      ? { outcome: normalizeString(item.outcome) }
      : {}),
  }
}

function notifyTaskPlanUpdated(conversationId: string, plan: TaskPlan) {
  try {
    chrome.runtime.sendMessage({
      type: "myz:taskPlanUpdated",
      data: { conversationId, plan },
    })
  } catch {
    // ignore
  }
}

function finalizePlan(plan: TaskPlan) {
  resolveTaskDependencies(plan)
  applyTaskBlocking(plan)
  ensureCurrentTask(plan)
  plan.status = computePlanStatus(plan)
}

export function normalizeTaskPlanPayload(value: unknown): TaskPlan | null {
  if (!isRecord(value)) return null
  const raw = value
  const normalized: TaskPlan = {
    id: normalizeString(raw.id) || generateId("plan"),
    status: normalizePlanStatus(raw.status),
    goal:
      normalizeString(raw.goal) || normalizeString(raw.originalUserRequest),
    assumptions: normalizeStringArray(raw.assumptions),
    ...(normalizeString(raw.summary)
      ? { summary: normalizeString(raw.summary) }
      : {}),
    ...(normalizeString(raw.outcome)
      ? { outcome: normalizeString(raw.outcome) }
      : {}),
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTaskItem) : [],
    currentTaskId: normalizeString(raw.currentTaskId) || null,
    createdAt: normalizeString(raw.createdAt) || new Date().toISOString(),
    updatedAt: normalizeString(raw.updatedAt) || new Date().toISOString(),
  }
  finalizePlan(normalized)
  return normalized
}

export async function getTaskPlan(
  conversationId: string,
): Promise<TaskPlan | null> {
  const conversation = await getConversation(conversationId)
  const raw = conversation?.metadata?.taskPlan
  if (!raw) return null
  return normalizeTaskPlanPayload(raw)
}

async function persistPlan(conversationId: string, plan: TaskPlan) {
  plan.updatedAt = new Date().toISOString()
  const updated = await updateConversationMetadata(conversationId, {
    taskPlan: plan,
  })
  if (updated) {
    notifyTaskPlanUpdated(conversationId, plan)
  }
  return plan
}

export async function initTaskPlan(options: {
  conversationId: string
  goal?: string
  originalUserRequest?: string
  tasks: Array<unknown>
  status?: TaskPlanStatus
  assumptions?: string[]
  summary?: string
}) {
  const now = new Date().toISOString()
  const plan: TaskPlan = {
    id: generateId("plan"),
    status: normalizePlanStatus(options.status || "planning"),
    goal:
      normalizeString(options.goal) ||
      normalizeString(options.originalUserRequest) ||
      "",
    assumptions: normalizeStringArray(options.assumptions),
    ...(normalizeString(options.summary)
      ? { summary: normalizeString(options.summary) }
      : {}),
    tasks: (options.tasks || []).map(normalizeTaskItem),
    currentTaskId: null,
    createdAt: now,
    updatedAt: now,
  }
  finalizePlan(plan)
  return persistPlan(options.conversationId, plan)
}

export async function updateTaskPlanStatus(options: {
  conversationId: string
  status?: TaskPlanStatus
  currentTaskId?: string | null
  goal?: string
  assumptions?: string[]
  summary?: string
  outcome?: string
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  if (options.status) {
    plan.status = normalizePlanStatus(options.status)
  }
  if (typeof options.currentTaskId !== "undefined") {
    plan.currentTaskId = options.currentTaskId
  }
  if (typeof options.goal === "string") {
    plan.goal = options.goal.trim()
  }
  if (typeof options.summary === "string") {
    const next = options.summary.trim()
    if (next) {
      plan.summary = next
    } else {
      delete plan.summary
    }
  }
  if (typeof options.outcome === "string") {
    const next = options.outcome.trim()
    if (next) {
      plan.outcome = next
    } else {
      delete plan.outcome
    }
  }
  if (typeof options.assumptions !== "undefined") {
    plan.assumptions = normalizeStringArray(options.assumptions)
  }
  finalizePlan(plan)
  return persistPlan(options.conversationId, plan)
}

export async function updateTaskStatus(options: {
  conversationId: string
  taskId: string
  status?: TaskStatus
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  const task = plan.tasks.find((item) => item.id === options.taskId)
  if (!task) return null
  if (options.status) {
    task.status = normalizeTaskStatus(options.status)
  }
  finalizePlan(plan)
  return persistPlan(options.conversationId, plan)
}

export async function updateTaskItem(options: {
  conversationId: string
  taskId: string
  patch: Partial<TaskItem> & { appendNote?: string }
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  const task = plan.tasks.find((item) => item.id === options.taskId)
  if (!task) return null

  if (typeof options.patch.title === "string") {
    task.title = options.patch.title.trim() || task.title
  }
  if (typeof options.patch.status !== "undefined") {
    task.status = normalizeTaskStatus(options.patch.status)
  }
  if (typeof options.patch.priority !== "undefined") {
    task.priority = normalizePriority(options.patch.priority)
  }
  if (typeof options.patch.owner !== "undefined") {
    task.owner = normalizeOwner(options.patch.owner)
  }
  if (typeof options.patch.category !== "undefined") {
    task.category = normalizeCategory(options.patch.category)
  }
  if (typeof options.patch.skills !== "undefined") {
    task.skills = normalizeStringArray(options.patch.skills)
  }
  if (typeof options.patch.blockedBy !== "undefined") {
    task.blockedBy = normalizeStringArray(options.patch.blockedBy)
  }
  if (typeof options.patch.blocks !== "undefined") {
    task.blocks = normalizeStringArray(options.patch.blocks)
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
    task.notes = normalizeNotes(options.patch.notes)
  }
  if (typeof options.patch.appendNote === "string") {
    const note = options.patch.appendNote.trim()
    if (note && !task.notes.includes(note)) {
      task.notes = [...task.notes, note]
    }
  }

  finalizePlan(plan)
  return persistPlan(options.conversationId, plan)
}

export async function completeAllTasks(options: {
  conversationId: string
  summary?: string
  outcome?: string
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
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
  finalizePlan(plan)
  return persistPlan(options.conversationId, plan)
}

export async function startTaskPlanExecution(conversationId: string) {
  const plan = await getTaskPlan(conversationId)
  if (!plan) return null
  plan.status = "executing"
  finalizePlan(plan)
  return persistPlan(conversationId, plan)
}

export async function listUnblockedTasks(options: {
  conversationId: string
  status?: TaskStatus[]
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return []
  finalizePlan(plan)
  const statuses = Array.isArray(options.status) ? options.status : []
  return plan.tasks.filter((task) => {
    if (isTaskBlocked(plan, task)) return false
    if (!statuses.length) return task.status !== "done"
    return statuses.includes(task.status)
  })
}
