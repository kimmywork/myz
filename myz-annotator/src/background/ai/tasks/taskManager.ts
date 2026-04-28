import {
  getConversation,
  updateConversationMetadata,
} from "@/sidepanel/aiStorage"
import {
  completeTaskPlan,
  createTaskPlan,
  getCurrentTask,
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

export { getCurrentTask }

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

export { normalizeTaskPlanPayload }

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
  patchTaskPlan(plan, options)
  return persistPlan(options.conversationId, plan)
}

export async function updateTaskStatus(options: {
  conversationId: string
  taskId: string
  status?: TaskStatus
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  const task = setTaskStatus(plan, options)
  if (!task) return null
  return persistPlan(options.conversationId, plan)
}

export async function updateTaskItem(options: {
  conversationId: string
  taskId: string
  patch: Partial<TaskItem> & { appendNote?: string }
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  const task = patchTaskItem(plan, options)
  if (!task) return null
  return persistPlan(options.conversationId, plan)
}

export async function completeAllTasks(options: {
  conversationId: string
  summary?: string
  outcome?: string
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return null
  completeTaskPlan(plan, options)
  return persistPlan(options.conversationId, plan)
}

export async function startTaskPlanExecution(conversationId: string) {
  const plan = await getTaskPlan(conversationId)
  if (!plan) return null
  patchTaskPlan(plan, { status: "executing" })
  return persistPlan(conversationId, plan)
}

export async function listUnblockedTasks(options: {
  conversationId: string
  status?: TaskStatus[]
}) {
  const plan = await getTaskPlan(options.conversationId)
  if (!plan) return []
  return listUnblockedTasksFromPlan(plan, options.status)
}
