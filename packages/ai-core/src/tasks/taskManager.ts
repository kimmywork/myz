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
