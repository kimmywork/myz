import { test } from "node:test"
import assert from "node:assert/strict"
import { matchPermission, createPermissionEngine } from "../src/permissions"

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

test("matchPermission: wildcard agent", () => {
  const rules = [
    { pattern: "*", action: "allow" as const },
    { pattern: "bash", action: "ask" as const },
  ]
  assert.equal(matchPermission(rules, { agent: "build", tool: "bash" }), "ask")
})

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
