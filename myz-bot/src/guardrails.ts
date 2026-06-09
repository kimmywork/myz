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

export interface AccessPolicy {
  allowedPaths?: string[]
  blockedPaths?: string[]
  allowedCommands?: string[]
  blockedCommands?: string[]
}

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
    throw new Error(`Path outside workspace: ${path}. Use allowedPaths to grant access.`)
  }
  return resolved
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
    )
    return regex.test(path)
  }
  return path.startsWith(pattern) || path === pattern
}

export function isPathAllowed(path: string, policy: AccessPolicy, workspaceRoot: string): boolean {
  const resolved = resolve(path)

  if (policy.blockedPaths) {
    for (const pattern of policy.blockedPaths) {
      if (matchesPattern(resolved, pattern)) {
        return false
      }
    }
  }

  if (isInsideWorkspace(resolved, workspaceRoot)) {
    return true
  }

  if (policy.allowedPaths) {
    for (const pattern of policy.allowedPaths) {
      if (matchesPattern(resolved, pattern)) {
        return true
      }
    }
  }

  return false
}

export function isCommandAllowed(command: string, policy: AccessPolicy): boolean {
  const tokens = tokenizeCommand(command)
  if (!tokens.length) return false

  const entry = tokens[0]

  if (policy.blockedCommands) {
    for (const pattern of policy.blockedCommands) {
      if (matchesPattern(entry, pattern)) {
        return false
      }
    }
  }

  if (BLOCKED_COMMANDS.has(entry)) {
    return false
  }

  if (policy.allowedCommands) {
    let allowed = false
    for (const pattern of policy.allowedCommands) {
      if (matchesPattern(entry, pattern)) {
        allowed = true
        break
      }
    }
    if (!allowed) return false
  }

  return true
}

export function validateCommand(
  command: string,
  workspaceRoot: string,
  policy?: AccessPolicy,
) {
  const tokens = tokenizeCommand(command)
  if (!tokens.length) {
    return { ok: false, reason: "Empty command", deniedPaths: [] as string[] }
  }

  if (policy && !isCommandAllowed(command, policy)) {
    return { ok: false, reason: `Command not allowed: ${tokens[0]}`, deniedPaths: [] as string[] }
  }

  const deniedPaths: string[] = []
  for (const token of tokens) {
    if (!isPathLike(token)) continue
    const candidate = isAbsolute(token) ? token : resolve(workspaceRoot, token)
    if (policy) {
      if (!isPathAllowed(candidate, policy, workspaceRoot)) {
        deniedPaths.push(candidate)
      }
    } else {
      if (!isInsideWorkspace(candidate, workspaceRoot)) {
        deniedPaths.push(candidate)
      }
    }
  }

  if (deniedPaths.length) {
    return {
      ok: false,
      reason: `Path not allowed: ${deniedPaths[0]}`,
      deniedPaths,
    }
  }

  return { ok: true }
}
