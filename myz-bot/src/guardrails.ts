import { resolve, relative, isAbsolute } from "node:path"

const BLOCKED_COMMANDS = new Set([
  "rm",
  "sudo",
  "mkfs",
  "dd",
  "shutdown",
  "reboot",
  "halt",
  "kill",
  "killall",
  "chown",
  "chmod",
])

export function tokenizeCommand(command: string) {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(command))) {
    tokens.push(match[1] || match[2] || match[3] || match[4] || "")
  }
  return tokens.filter(Boolean)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isUrlToken(token: string) {
  return /^https?:\/\//i.test(token)
}

function isPathLike(token: string) {
  if (!token) return false
  if (isUrlToken(token)) return false
  return token.includes("/") || token.startsWith(".")
}

export function isInsideWorkspace(path: string, workspaceRoot: string) {
  const resolved = resolve(path)
  const rel = relative(workspaceRoot, resolved)
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("../"))
}

export function assertInsideWorkspace(path: string, workspaceRoot: string) {
  const resolved = resolve(path)
  if (!isInsideWorkspace(resolved, workspaceRoot)) {
    throw new Error(`Path not allowed: ${path}`)
  }
  return resolved
}

export function resolveCommandVirtualPaths(
  command: string,
  aliases: Record<string, string>,
) {
  const entries = Object.entries(aliases).sort((left, right) => right[0].length - left[0].length)
  let next = command
  for (const [alias, target] of entries) {
    const pattern = new RegExp(
      `(^|[\\s"'=:(\\[{;&|])${escapeRegExp(alias)}(?=$|[\\]\\[\\/\\s"'(){};|&])`,
      "g",
    )
    next = next.replace(pattern, (_match, prefix: string) => `${prefix}${target}`)
  }
  return next
}

export function validateCommand(command: string, workspaceRoot: string) {
  const tokens = tokenizeCommand(command)
  if (!tokens.length) {
    return { ok: false, reason: "Empty command", deniedPaths: [] as string[] }
  }
  const entry = tokens[0]
  if (BLOCKED_COMMANDS.has(entry)) {
    return { ok: false, reason: `Command blocked: ${entry}`, deniedPaths: [] as string[] }
  }

  const deniedPaths: string[] = []
  for (const token of tokens) {
    if (!isPathLike(token)) continue
    const candidate = isAbsolute(token)
      ? token
      : resolve(workspaceRoot, token)
    if (!isInsideWorkspace(candidate, workspaceRoot)) {
      deniedPaths.push(candidate)
    }
  }

  if (deniedPaths.length) {
    return {
      ok: false,
      reason: `Path outside workspace: ${deniedPaths[0]}`,
      deniedPaths,
    }
  }

  return { ok: true }
}
