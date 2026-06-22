import type { PermissionRule } from "./types"

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::::DOUBLE_STAR::::")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
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

export interface PermissionContext {
  agent: string
  tool: string
  args?: Record<string, unknown>
}

function buildCompoundKey(context: PermissionContext, rulePattern: string): boolean {
  const colonIndex = rulePattern.indexOf(":")
  if (colonIndex === -1) return false

  const toolPattern = rulePattern.slice(0, colonIndex)
  const argPattern = rulePattern.slice(colonIndex + 1)

  if (!matchesGlob(context.tool, toolPattern)) return false

  if (context.args && typeof context.args === "object") {
    const argValue = context.args.command || context.args.path || context.args.pattern || ""
    if (typeof argValue === "string" && matchesGlob(argValue, argPattern)) return true
  }

  return false
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
    const pattern = rule.pattern

    if (pattern.includes(":")) {
      if (buildCompoundKey(context, pattern)) {
        result = rule.action
      }
      continue
    }

    if (matchesGlob(context.tool, pattern)) {
      result = rule.action
    }
  }

  return result
}

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
