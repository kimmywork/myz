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

export function validateCommand(command: string, workspaceRoot: string) {
  const tokens = tokenizeCommand(command)
  if (!tokens.length) {
    return { ok: false, reason: "Empty command" }
  }
  const entry = tokens[0]
  if (BLOCKED_COMMANDS.has(entry)) {
    return { ok: false, reason: `Command blocked: ${entry}` }
  }

  for (const token of tokens) {
    if (!isPathLike(token)) continue
    const candidate = isAbsolute(token)
      ? token
      : resolve(workspaceRoot, token)
    if (!isInsideWorkspace(candidate, workspaceRoot)) {
      return { ok: false, reason: `Path outside workspace: ${token}` }
    }
  }

  return { ok: true }
}
