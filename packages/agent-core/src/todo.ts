import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface TodoItem {
  id: string
  text: string
  status: "pending" | "in_progress" | "done" | "blocked"
  parentId?: string
  dependsOn?: string[]
  verification?: {
    type: "typecheck" | "test" | "build" | "manual"
    result: "pass" | "fail" | "skip"
    evidence: string
  }
  createdAt: string
  updatedAt: string
}

export interface TodoState {
  todos: TodoItem[]
  activeTask?: string  // 当前正在执行的 todo id
}

export function createEmptyTodoState(): TodoState {
  return { todos: [] }
}

export function loadTodoState(filePath: string): TodoState {
  if (!existsSync(filePath)) return createEmptyTodoState()
  try {
    const content = readFileSync(filePath, "utf-8")
    const data = JSON.parse(content)
    if (!Array.isArray(data.todos)) return createEmptyTodoState()
    return data as TodoState
  } catch {
    return createEmptyTodoState()
  }
}

export function saveTodoState(filePath: string, state: TodoState): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function addTodo(state: TodoState, text: string, parentId?: string, dependsOn?: string[]): TodoItem {
  const now = new Date().toISOString()
  const todo: TodoItem = {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    status: "pending",
    parentId,
    dependsOn,
    createdAt: now,
    updatedAt: now,
  }
  state.todos.push(todo)
  return todo
}

export function updateTodoStatus(state: TodoState, id: string, status: TodoItem["status"]): TodoItem | null {
  const todo = state.todos.find((t) => t.id === id)
  if (!todo) return null
  todo.status = status
  todo.updatedAt = new Date().toISOString()
  return todo
}

export function setTodoVerification(
  state: TodoState,
  id: string,
  verification: TodoItem["verification"],
): TodoItem | null {
  const todo = state.todos.find((t) => t.id === id)
  if (!todo) return null
  todo.verification = verification
  todo.updatedAt = new Date().toISOString()
  return todo
}

export function getActiveTask(state: TodoState): TodoItem | undefined {
  if (!state.activeTask) return undefined
  return state.todos.find((t) => t.id === state.activeTask)
}

export function setActiveTask(state: TodoState, id: string | undefined): void {
  state.activeTask = id
}

export function getTodoProgress(state: TodoState): { total: number; done: number; inProgress: number; blocked: number } {
  const total = state.todos.filter((t) => !t.parentId).length  // 只计算顶层 todo
  const done = state.todos.filter((t) => !t.parentId && t.status === "done").length
  const inProgress = state.todos.filter((t) => !t.parentId && t.status === "in_progress").length
  const blocked = state.todos.filter((t) => !t.parentId && t.status === "blocked").length
  return { total, done, inProgress, blocked }
}

export function getTopLevelTodos(state: TodoState): TodoItem[] {
  return state.todos.filter((t) => !t.parentId)
}

export function getSubtasks(state: TodoState, parentId: string): TodoItem[] {
  return state.todos.filter((t) => t.parentId === parentId)
}

export function canStartTodo(state: TodoState, id: string): boolean {
  const todo = state.todos.find((t) => t.id === id)
  if (!todo) return false
  if (todo.status !== "pending") return false
  if (!todo.dependsOn || todo.dependsOn.length === 0) return true
  return todo.dependsOn.every((depId) => {
    const dep = state.todos.find((t) => t.id === depId)
    return dep && dep.status === "done"
  })
}

export function getActiveTodosSummary(state: TodoState): string {
  const { total, done, inProgress, blocked } = getTodoProgress(state)
  if (total === 0) return ""
  const activeTask = getActiveTask(state)
  const parts = [`${done}/${total}`]
  if (inProgress > 0) parts.push(`${inProgress} in progress`)
  if (blocked > 0) parts.push(`${blocked} blocked`)
  if (activeTask) parts.push(`Task: ${activeTask.text}`)
  return parts.join(" | ")
}
