import type { PermissionRule } from "./types"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

// --- Permission Mode ---

export type PermissionMode = "readonly" | "acceptEdits" | "auto" | "bypass"

// --- Permission Levels ---

export interface PermissionLevel {
  session: PermissionRule[]
  workspace: PermissionRule[]
  global: PermissionRule[]
}

// --- Permission Result ---

export interface PermissionResult {
  result: "allow" | "deny" | "ask" | "auto"
  rule?: string
  level?: "session" | "workspace" | "global"
  reason?: string
}

// --- Glob matching ---

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::::DOUBLE_STAR::::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::::DOUBLE_STAR::::/g, ".*")
  return new RegExp(`^${escaped}$`)
}

function matchesGlob(value: string, pattern: string): boolean {
  if (pattern === "*") return true
  if (pattern.includes("*") || pattern.includes("?")) {
    return globToRegex(pattern).test(value)
  }
  return value === pattern
}

// --- Tool pattern parsing ---

export interface ToolPattern {
  tool: string
  patterns: string[]
}

export function parseToolPattern(pattern: string): ToolPattern | null {
  // 格式: Tool(pattern1, pattern2)
  const match = pattern.match(/^(\w+)\((.+)\)$/)
  if (!match) return null
  const tool = match[1]
  const patterns = match[2].split(",").map((p) => p.trim()).filter(Boolean)
  return { tool, patterns }
}

function matchToolPattern(context: PermissionContext, rulePattern: string): boolean {
  // 先尝试解析 Tool(pattern) 格式
  const parsed = parseToolPattern(rulePattern)
  if (parsed) {
    if (context.tool.toLowerCase() !== parsed.tool.toLowerCase()) return false
    if (!context.args) return false
    const argValue = String(context.args.command || context.args.path || context.args.pattern || "")
    return parsed.patterns.some((p) => matchesGlob(argValue, p))
  }

  // 旧格式: tool:pattern
  const colonIndex = rulePattern.indexOf(":")
  if (colonIndex !== -1) {
    const toolPattern = rulePattern.slice(0, colonIndex)
    const argPattern = rulePattern.slice(colonIndex + 1)
    if (!matchesGlob(context.tool, toolPattern)) return false
    if (context.args && typeof context.args === "object") {
      const argValue = context.args.command || context.args.path || context.args.pattern || ""
      if (typeof argValue === "string") return matchesGlob(argValue, argPattern)
    }
    return false
  }

  // 简单工具名匹配
  return matchesGlob(context.tool, rulePattern)
}

// --- Permission matching ---

export interface PermissionContext {
  agent: string
  tool: string
  args?: Record<string, unknown>
}

export function matchPermission(
  rules: PermissionRule[],
  context: PermissionContext,
  agentOverride?: PermissionRule[],
): "allow" | "ask" | "deny" {
  const allRules = agentOverride
    ? [...rules, ...agentOverride]
    : rules

  let result: "allow" | "ask" | "deny" = "allow"

  for (const rule of allRules) {
    if (matchToolPattern(context, rule.pattern)) {
      result = rule.action
    }
  }

  return result
}

// --- Hierarchical permission matching ---

export function matchHierarchicalPermission(
  levels: PermissionLevel,
  context: PermissionContext,
  mode: PermissionMode = "auto",
): PermissionResult {
  // bypass 模式直接 allow
  if (mode === "bypass") {
    return { result: "allow", reason: "bypass mode" }
  }

  // readonly 模式：只允许读操作
  if (mode === "readonly") {
    const readOnlyTools = ["read", "list", "glob", "grep"]
    if (readOnlyTools.includes(context.tool.toLowerCase())) {
      return { result: "allow", reason: "readonly mode: read-only tool" }
    }
    return { result: "deny", reason: "readonly mode: write operation not allowed" }
  }

  // acceptEdits 模式：允许读写操作，但 Run 需要检查
  if (mode === "acceptEdits") {
    const editTools = ["read", "list", "glob", "grep", "write", "edit"]
    if (editTools.includes(context.tool.toLowerCase())) {
      return { result: "allow", reason: "acceptEdits mode: edit tool" }
    }
    // Run 工具需要检查权限规则
  }

  // 按级别匹配：global → workspace → session
  // 同一级别内 last-match-wins
  // session 覆盖 workspace，workspace 覆盖 global
  const levelOrder: Array<{ level: "session" | "workspace" | "global"; rules: PermissionRule[] }> = [
    { level: "global", rules: levels.global },
    { level: "workspace", rules: levels.workspace },
    { level: "session", rules: levels.session },
  ]

  let result: "allow" | "deny" | "ask" = "allow"
  let matchedLevel: "session" | "workspace" | "global" | undefined
  let matchedRule: string | undefined

  for (const { level, rules } of levelOrder) {
    for (const rule of rules) {
      if (matchToolPattern(context, rule.pattern)) {
        result = rule.action
        matchedLevel = level
        matchedRule = rule.pattern
      }
    }
  }

  // auto 模式：如果匹配到 ask，返回 auto 让 LLM 判断
  if (mode === "auto" && result === "ask") {
    return {
      result: "auto",
      rule: matchedRule,
      level: matchedLevel,
      reason: "auto mode: LLM should decide",
    }
  }

  return {
    result,
    rule: matchedRule,
    level: matchedLevel,
    reason: matchedLevel ? `matched ${matchedLevel} rule` : "default allow",
  }
}

// --- Permission persistence ---

export function loadPermissions(filePath: string): PermissionLevel {
  if (!existsSync(filePath)) {
    return { session: [], workspace: [], global: [] }
  }
  try {
    const content = readFileSync(filePath, "utf-8")
    const data = JSON.parse(content)
    return {
      session: Array.isArray(data.session) ? data.session : [],
      workspace: Array.isArray(data.workspace) ? data.workspace : [],
      global: Array.isArray(data.global) ? data.global : [],
    }
  } catch {
    return { session: [], workspace: [], global: [] }
  }
}

export function savePermissions(filePath: string, levels: PermissionLevel): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(levels, null, 2))
}

export function addPermissionRule(
  levels: PermissionLevel,
  level: "session" | "workspace",
  rule: PermissionRule,
): void {
  levels[level].push(rule)
}

// --- QueryPermission tool ---

export function queryPermission(
  levels: PermissionLevel,
  context: PermissionContext,
  mode: PermissionMode = "auto",
): PermissionResult {
  return matchHierarchicalPermission(levels, context, mode)
}

// --- Permission engine ---

export function createPermissionEngine(
  globalRules: PermissionRule[] = [],
) {
  const agentOverrides = new Map<string, PermissionRule[]>()

  function setAgentOverrides(agentId: string, rules: PermissionRule[]) {
    agentOverrides.set(agentId, rules)
  }

  function check(context: PermissionContext): "allow" | "ask" | "deny" {
    const overrides = agentOverrides.get(context.agent)
    return matchPermission(globalRules, context, overrides)
  }

  return { check, setAgentOverrides, globalRules }
}
