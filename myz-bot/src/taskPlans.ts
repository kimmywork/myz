import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  completeTaskPlan,
  createTaskPlan,
  listUnblockedTasksFromPlan,
  normalizeTaskPlanPayload,
  patchTaskItem,
  patchTaskPlan,
  setTaskStatus,
  type TaskItem,
  type TaskPlan,
  type TaskPlanStatus,
  type TaskStatus,
} from "@myz/ai-core/tasks/taskManager"

export type {
  TaskItem,
  TaskPlan,
  TaskPlanStatus,
  TaskPriority,
  TaskStatus,
} from "@myz/ai-core/tasks/taskManager"

function getTaskPlanPath(conversationDir: string) {
  return resolve(conversationDir, "task-plan.json")
}

function saveTaskPlan(conversationDir: string, plan: TaskPlan) {
  plan.updatedAt = new Date().toISOString()
  writeFileSync(getTaskPlanPath(conversationDir), JSON.stringify(plan, null, 2))
  return plan
}

export function getTaskPlan(conversationDir: string): TaskPlan | null {
  const path = getTaskPlanPath(conversationDir)
  if (!existsSync(path)) return null
  try {
    return normalizeTaskPlanPayload(JSON.parse(readFileSync(path, "utf-8")))
  } catch {
    return null
  }
}

export function initTaskPlan(options: {
  conversationDir: string
  goal?: string
  originalUserRequest?: string
  tasks: Array<unknown>
  status?: TaskPlanStatus
  assumptions?: string[]
  summary?: string
}) {
  const plan = createTaskPlan({
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: options.status || "planning",
    goal: options.goal,
    originalUserRequest: options.originalUserRequest,
    assumptions: options.assumptions,
    summary: options.summary,
    tasks: options.tasks || [],
    currentTaskId: null,
  })
  return saveTaskPlan(options.conversationDir, plan)
}

export function updateTaskPlanStatus(options: {
  conversationDir: string
  status?: TaskPlanStatus
  currentTaskId?: string | null
  goal?: string
  assumptions?: string[]
  summary?: string
  outcome?: string
}) {
  const plan = getTaskPlan(options.conversationDir)
  if (!plan) return null
  patchTaskPlan(plan, options)
  return saveTaskPlan(options.conversationDir, plan)
}

export function updateTaskStatus(options: {
  conversationDir: string
  taskId: string
  status?: TaskStatus
}) {
  const plan = getTaskPlan(options.conversationDir)
  if (!plan) return null
  const task = setTaskStatus(plan, options)
  if (!task) return null
  return saveTaskPlan(options.conversationDir, plan)
}

export function updateTaskItem(options: {
  conversationDir: string
  taskId: string
  patch: Partial<TaskItem> & { appendNote?: string }
}) {
  const plan = getTaskPlan(options.conversationDir)
  if (!plan) return null
  const task = patchTaskItem(plan, options)
  if (!task) return null
  return saveTaskPlan(options.conversationDir, plan)
}

export function completeAllTasks(options: {
  conversationDir: string
  summary?: string
  outcome?: string
}) {
  const plan = getTaskPlan(options.conversationDir)
  if (!plan) return null
  completeTaskPlan(plan, options)
  return saveTaskPlan(options.conversationDir, plan)
}

export function listUnblockedTasks(options: {
  conversationDir: string
  status?: TaskStatus[]
}) {
  const plan = getTaskPlan(options.conversationDir)
  if (!plan) return []
  return listUnblockedTasksFromPlan(plan, options.status)
}
