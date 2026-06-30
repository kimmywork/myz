import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  createEmptyTodoState,
  loadTodoState,
  saveTodoState,
  addTodo,
  updateTodoStatus,
  setTodoVerification,
  getActiveTask,
  setActiveTask,
  getTodoProgress,
  getTopLevelTodos,
  getSubtasks,
  canStartTodo,
  getActiveTodosSummary,
} from "../src/todo"

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "todo-test-"))
}

test("createEmptyTodoState returns empty state", () => {
  const state = createEmptyTodoState()
  assert.deepEqual(state.todos, [])
  assert.equal(state.activeTask, undefined)
})

test("addTodo creates a new todo", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  assert.equal(todo.text, "Test task")
  assert.equal(todo.status, "pending")
  assert.ok(todo.id.startsWith("todo-"))
  assert.ok(todo.createdAt)
  assert.ok(todo.updatedAt)
  assert.equal(state.todos.length, 1)
})

test("addTodo with parentId and dependsOn", () => {
  const state = createEmptyTodoState()
  const parent = addTodo(state, "Parent task")
  const child = addTodo(state, "Child task", parent.id, [parent.id])
  assert.equal(child.parentId, parent.id)
  assert.deepEqual(child.dependsOn, [parent.id])
})

test("updateTodoStatus updates status", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  const updated = updateTodoStatus(state, todo.id, "in_progress")
  assert.equal(updated?.status, "in_progress")
  assert.ok(updated?.updatedAt >= todo.updatedAt)
})

test("updateTodoStatus returns null for unknown id", () => {
  const state = createEmptyTodoState()
  const result = updateTodoStatus(state, "unknown", "done")
  assert.equal(result, null)
})

test("setTodoVerification sets verification", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  const verification = { type: "typecheck" as const, result: "pass" as const, evidence: "0 errors" }
  const updated = setTodoVerification(state, todo.id, verification)
  assert.deepEqual(updated?.verification, verification)
})

test("setTodoVerification returns null for unknown id", () => {
  const state = createEmptyTodoState()
  const result = setTodoVerification(state, "unknown", { type: "test", result: "pass", evidence: "" })
  assert.equal(result, null)
})

test("getActiveTask returns active task", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  setActiveTask(state, todo.id)
  assert.equal(getActiveTask(state)?.id, todo.id)
})

test("getActiveTask returns undefined when no active task", () => {
  const state = createEmptyTodoState()
  assert.equal(getActiveTask(state), undefined)
})

test("setActiveTask clears active task", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  setActiveTask(state, todo.id)
  setActiveTask(state, undefined)
  assert.equal(getActiveTask(state), undefined)
})

test("getTodoProgress counts top-level todos", () => {
  const state = createEmptyTodoState()
  const parent = addTodo(state, "Parent")
  addTodo(state, "Child", parent.id)
  updateTodoStatus(state, parent.id, "done")
  const progress = getTodoProgress(state)
  assert.equal(progress.total, 1)
  assert.equal(progress.done, 1)
  assert.equal(progress.inProgress, 0)
  assert.equal(progress.blocked, 0)
})

test("getTopLevelTodos excludes subtasks", () => {
  const state = createEmptyTodoState()
  const parent = addTodo(state, "Parent")
  addTodo(state, "Child", parent.id)
  const top = getTopLevelTodos(state)
  assert.equal(top.length, 1)
  assert.equal(top[0].id, parent.id)
})

test("getSubtasks returns subtasks of parent", () => {
  const state = createEmptyTodoState()
  const parent = addTodo(state, "Parent")
  const child = addTodo(state, "Child", parent.id)
  const subtasks = getSubtasks(state, parent.id)
  assert.equal(subtasks.length, 1)
  assert.equal(subtasks[0].id, child.id)
})

test("canStartTodo returns true when no dependencies", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  assert.equal(canStartTodo(state, todo.id), true)
})

test("canStartTodo returns true when dependencies are done", () => {
  const state = createEmptyTodoState()
  const dep = addTodo(state, "Dependency")
  updateTodoStatus(state, dep.id, "done")
  const todo = addTodo(state, "Test task", undefined, [dep.id])
  assert.equal(canStartTodo(state, todo.id), true)
})

test("canStartTodo returns false when dependencies are not done", () => {
  const state = createEmptyTodoState()
  const dep = addTodo(state, "Dependency")
  const todo = addTodo(state, "Test task", undefined, [dep.id])
  assert.equal(canStartTodo(state, todo.id), false)
})

test("canStartTodo returns false for non-pending todo", () => {
  const state = createEmptyTodoState()
  const todo = addTodo(state, "Test task")
  updateTodoStatus(state, todo.id, "in_progress")
  assert.equal(canStartTodo(state, todo.id), false)
})

test("canStartTodo returns false for unknown id", () => {
  const state = createEmptyTodoState()
  assert.equal(canStartTodo(state, "unknown"), false)
})

test("getActiveTodosSummary returns empty string when no todos", () => {
  const state = createEmptyTodoState()
  assert.equal(getActiveTodosSummary(state), "")
})

test("getActiveTodosSummary returns progress", () => {
  const state = createEmptyTodoState()
  addTodo(state, "Task 1")
  const task2 = addTodo(state, "Task 2")
  updateTodoStatus(state, task2.id, "done")
  const summary = getActiveTodosSummary(state)
  assert.match(summary, /1\/2/)
})

test("getActiveTodosSummary includes active task", () => {
  const state = createEmptyTodoState()
  const task = addTodo(state, "Active task")
  setActiveTask(state, task.id)
  const summary = getActiveTodosSummary(state)
  assert.match(summary, /Task: Active task/)
})

test("loadTodoState and saveTodoState roundtrip", () => {
  const dir = createTmpDir()
  try {
    const filePath = join(dir, "todo.json")
    const state = createEmptyTodoState()
    addTodo(state, "Test task")
    saveTodoState(filePath, state)
    const loaded = loadTodoState(filePath)
    assert.equal(loaded.todos.length, 1)
    assert.equal(loaded.todos[0].text, "Test task")
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test("loadTodoState returns empty state for missing file", () => {
  const state = loadTodoState("/nonexistent/todo.json")
  assert.deepEqual(state.todos, [])
})

test("loadTodoState returns empty state for invalid JSON", () => {
  const dir = createTmpDir()
  try {
    const filePath = join(dir, "todo.json")
    writeFileSync(filePath, "invalid json")
    const state = loadTodoState(filePath)
    assert.deepEqual(state.todos, [])
  } finally {
    rmSync(dir, { recursive: true })
  }
})
