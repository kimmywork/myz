import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  matchPermission,
  matchHierarchicalPermission,
  loadPermissions,
  savePermissions,
  addPermissionRule,
  queryPermission,
  parseToolPattern,
  createPermissionEngine,
} from "../src/permissions"
import type { PermissionLevel, PermissionContext, PermissionMode } from "../src/permissions"

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "permission-test-"))
}

// --- parseToolPattern tests ---

test("parseToolPattern: parses Tool(pattern) format", () => {
  const result = parseToolPattern("Edit(**/*.js)")
  assert.deepEqual(result, { tool: "Edit", patterns: ["**/*.js"] })
})

test("parseToolPattern: parses multiple patterns", () => {
  const result = parseToolPattern("Run(rm *, sed *)")
  assert.deepEqual(result, { tool: "Run", patterns: ["rm *", "sed *"] })
})

test("parseToolPattern: returns null for invalid format", () => {
  assert.equal(parseToolPattern("bash"), null)
  assert.equal(parseToolPattern("bash:git push*"), null)
})

// --- matchPermission tests ---

test("matchPermission: simple tool name match", () => {
  const rules = [
    { pattern: "bash", action: "ask" as const },
    { pattern: "edit", action: "deny" as const },
  ]
  assert.equal(matchPermission(rules, { agent: "build", tool: "bash" }), "ask")
  assert.equal(matchPermission(rules, { agent: "build", tool: "edit" }), "deny")
  assert.equal(matchPermission(rules, { agent: "build", tool: "read" }), "allow")
})

test("matchPermission: glob pattern", () => {
  const rules = [
    { pattern: "bash:git push*", action: "deny" as const },
    { pattern: "bash:git status", action: "allow" as const },
  ]
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "bash", args: { command: "git push origin main" } }),
    "deny",
  )
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "bash", args: { command: "git status" } }),
    "allow",
  )
})

test("matchPermission: Tool(pattern) format", () => {
  const rules = [
    { pattern: "Edit(**/*.js)", action: "allow" as const },
    { pattern: "Run(rm **)", action: "deny" as const },
  ]
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "Edit", args: { path: "src/index.js" } }),
    "allow",
  )
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } }),
    "deny",
  )
})

test("matchPermission: multiple patterns in Tool(pattern)", () => {
  const rules = [
    { pattern: "Edit(**/*.js, **/*.ts)", action: "allow" as const },
  ]
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "Edit", args: { path: "src/index.js" } }),
    "allow",
  )
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "Edit", args: { path: "src/index.ts" } }),
    "allow",
  )
  assert.equal(
    matchPermission(rules, { agent: "build", tool: "Edit", args: { path: "src/index.md" } }),
    "allow",  // default allow, no rule matches
  )
})

test("matchPermission: last-match-wins", () => {
  const rules = [
    { pattern: "bash", action: "deny" as const },
    { pattern: "bash", action: "allow" as const },
  ]
  assert.equal(matchPermission(rules, { agent: "build", tool: "bash" }), "allow")
})

test("matchPermission: agent override", () => {
  const globalRules = [
    { pattern: "bash", action: "allow" as const },
  ]
  const agentOverrides = [
    { pattern: "bash", action: "deny" as const },
  ]
  assert.equal(
    matchPermission(globalRules, { agent: "plan", tool: "bash" }, agentOverrides),
    "deny",
  )
})

// --- matchHierarchicalPermission tests ---

test("matchHierarchicalPermission: session > workspace > global", () => {
  const levels: PermissionLevel = {
    session: [{ pattern: "Run(rm **)", action: "allow" }],
    workspace: [{ pattern: "Run(rm **)", action: "deny" }],
    global: [{ pattern: "Run(rm **)", action: "deny" }],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } })
  assert.equal(result.result, "allow")
  assert.equal(result.level, "session")
})

test("matchHierarchicalPermission: workspace > global", () => {
  const levels: PermissionLevel = {
    session: [],
    workspace: [{ pattern: "Run(rm **)", action: "allow" }],
    global: [{ pattern: "Run(rm **)", action: "deny" }],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } })
  assert.equal(result.result, "allow")
  assert.equal(result.level, "workspace")
})

test("matchHierarchicalPermission: global fallback", () => {
  const levels: PermissionLevel = {
    session: [],
    workspace: [],
    global: [{ pattern: "Run(rm **)", action: "deny" }],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } })
  assert.equal(result.result, "deny")
  assert.equal(result.level, "global")
})

test("matchHierarchicalPermission: same level last-match-wins", () => {
  const levels: PermissionLevel = {
    session: [
      { pattern: "Run(rm **)", action: "deny" },
      { pattern: "Run(rm **)", action: "allow" },
    ],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } })
  assert.equal(result.result, "allow")
  assert.equal(result.level, "session")
})

test("matchHierarchicalPermission: bypass mode", () => {
  const levels: PermissionLevel = {
    session: [{ pattern: "Run(rm **)", action: "deny" }],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } }, "bypass")
  assert.equal(result.result, "allow")
  assert.equal(result.reason, "bypass mode")
})

test("matchHierarchicalPermission: readonly mode allows read tools", () => {
  const levels: PermissionLevel = {
    session: [],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "read" }, "readonly")
  assert.equal(result.result, "allow")
})

test("matchHierarchicalPermission: readonly mode denies write tools", () => {
  const levels: PermissionLevel = {
    session: [],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "write" }, "readonly")
  assert.equal(result.result, "deny")
})

test("matchHierarchicalPermission: acceptEdits mode allows edit tools", () => {
  const levels: PermissionLevel = {
    session: [],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "edit" }, "acceptEdits")
  assert.equal(result.result, "allow")
})

test("matchHierarchicalPermission: auto mode returns auto for ask", () => {
  const levels: PermissionLevel = {
    session: [{ pattern: "Run(rm **)", action: "ask" }],
    workspace: [],
    global: [],
  }
  const result = matchHierarchicalPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } }, "auto")
  assert.equal(result.result, "auto")
  assert.equal(result.reason, "auto mode: LLM should decide")
})

// --- loadPermissions and savePermissions tests ---

test("loadPermissions and savePermissions roundtrip", () => {
  const dir = createTmpDir()
  try {
    const filePath = join(dir, "permissions.json")
    const levels: PermissionLevel = {
      session: [{ pattern: "Run(rm **)", action: "allow" }],
      workspace: [{ pattern: "Edit(**/*.js)", action: "deny" }],
      global: [{ pattern: "*", action: "allow" }],
    }
    savePermissions(filePath, levels)
    const loaded = loadPermissions(filePath)
    assert.deepEqual(loaded, levels)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test("loadPermissions returns empty levels for missing file", () => {
  const levels = loadPermissions("/nonexistent/permissions.json")
  assert.deepEqual(levels, { session: [], workspace: [], global: [] })
})

test("loadPermissions returns empty levels for invalid JSON", () => {
  const dir = createTmpDir()
  try {
    const filePath = join(dir, "permissions.json")
    writeFileSync(filePath, "invalid json")
    const levels = loadPermissions(filePath)
    assert.deepEqual(levels, { session: [], workspace: [], global: [] })
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// --- addPermissionRule tests ---

test("addPermissionRule adds rule to session", () => {
  const levels: PermissionLevel = { session: [], workspace: [], global: [] }
  addPermissionRule(levels, "session", { pattern: "Run(rm **)", action: "deny" })
  assert.equal(levels.session.length, 1)
  assert.equal(levels.session[0].pattern, "Run(rm **)")
})

test("addPermissionRule adds rule to workspace", () => {
  const levels: PermissionLevel = { session: [], workspace: [], global: [] }
  addPermissionRule(levels, "workspace", { pattern: "Edit(**/*.js)", action: "allow" })
  assert.equal(levels.workspace.length, 1)
  assert.equal(levels.workspace[0].pattern, "Edit(**/*.js)")
})

// --- queryPermission tests ---

test("queryPermission returns detailed result", () => {
  const levels: PermissionLevel = {
    session: [{ pattern: "Run(rm **)", action: "deny" }],
    workspace: [],
    global: [],
  }
  const result = queryPermission(levels, { agent: "build", tool: "Run", args: { command: "rm -rf node_modules" } })
  assert.equal(result.result, "deny")
  assert.equal(result.rule, "Run(rm **)")
  assert.equal(result.level, "session")
})

// --- createPermissionEngine tests ---

test("createPermissionEngine: basic check", () => {
  const engine = createPermissionEngine([
    { pattern: "bash:rm *", action: "deny" as const },
    { pattern: "edit:.env*", action: "deny" as const },
  ])
  assert.equal(
    engine.check({ agent: "build", tool: "bash", args: { command: "rm -rf node_modules" } }),
    "deny",
  )
  assert.equal(
    engine.check({ agent: "build", tool: "edit", args: { path: ".env.local" } }),
    "deny",
  )
  assert.equal(
    engine.check({ agent: "build", tool: "read" }),
    "allow",
  )
})

test("createPermissionEngine: per-agent override", () => {
  const engine = createPermissionEngine([
    { pattern: "bash", action: "allow" as const },
  ])
  engine.setAgentOverrides("plan", [
    { pattern: "bash", action: "deny" as const },
  ])
  assert.equal(engine.check({ agent: "build", tool: "bash" }), "allow")
  assert.equal(engine.check({ agent: "plan", tool: "bash" }), "deny")
})
