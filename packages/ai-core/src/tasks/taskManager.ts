export type TaskPlanStatus =
  | "planning"
  | "reviewing"
  | "needs_revision"
  | "executing"
  | "done"
  | "validating"
  | "validated"
  | "needs_rework"

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked"
export type DeliverableStatus = "pending" | "done"
export type TaskPriority = "low" | "medium" | "high"
export type TaskOwner =
  | "planner"
  | "executor"
  | "research"
  | "automation"
  | "review"
export type TaskCategory = "quick" | "research" | "automation" | "reasoning"
export type TaskPlanMode = "quick" | "orchestrated"

export interface TaskArtifact {
  type: "page-context" | "screenshot" | "dom-html" | "url" | "note" | "json"
  payload: unknown
}

export interface TaskDeliverable {
  id: string
  description: string
  status: DeliverableStatus
  artifacts: TaskArtifact[]
}

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
  deliverables: TaskDeliverable[]
}

export interface TaskPlanReview {
  status: "pending" | "pass" | "needs_revision"
  issues: string[]
  missingInfo: string[]
}

export interface TaskValidationResult {
  status: "pending" | "pass" | "fail"
  expectationScore: number
  deliverableScore: number
  issues: string[]
  missingDeliverables: string[]
}

export interface TaskPlan {
  id: string
  status: TaskPlanStatus
  mode: TaskPlanMode
  originalUserRequest: string
  assumptions?: string[]
  tasks: TaskItem[]
  currentTaskId: string | null
  planReview: TaskPlanReview
  validation: TaskValidationResult
  createdAt: string
  updatedAt: string
}
