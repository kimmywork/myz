import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { loadSessionMetadata } from "./sessions"

export type ElevatedPermissionAccess = "read" | "write" | "run"
export type ElevatedPermissionRequestStatus = "pending" | "approved" | "rejected"
export type ElevatedPermissionMatcher = "prefix" | "glob"

export interface ElevatedPermissionGrant {
  id: string
  access: ElevatedPermissionAccess
  matcher: ElevatedPermissionMatcher
  pattern: string
  createdAt: string
  approvedAt: string
  approvedBy: string
  sourceRequestId?: string
  pathPrefix?: string
}

export interface ElevatedPermissionRequest {
  id: string
  status: ElevatedPermissionRequestStatus
  access: ElevatedPermissionAccess
  matcher: ElevatedPermissionMatcher
  pattern: string
  rawTarget: string
  toolName: string
  reason: string
  sessionId?: string
  requestedBy?: string
  createdAt: string
  updatedAt: string
  resolvedBy?: string
  grantId?: string
  pathPrefix?: string
}

interface PermissionState {
  schemaVersion: string
  requests: ElevatedPermissionRequest[]
  grants: ElevatedPermissionGrant[]
}

const SCHEMA_VERSION = "1.1.0"

function getPermissionPaths(workspaceRoot: string) {
  const dir = resolve(workspaceRoot, "permissions")
  return {
    dir,
    stateFile: resolve(dir, "state.json"),
  }
}

export function ensurePermissionRuntime(workspaceRoot: string) {
  const paths = getPermissionPaths(workspaceRoot)
  mkdirSync(paths.dir, { recursive: true })
  if (!existsSync(paths.stateFile)) {
    writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
          requests: [],
          grants: [],
        } satisfies PermissionState,
        null,
        2,
      ),
    )
  }
  return paths
}

function loadPermissionState(workspaceRoot: string): PermissionState {
  const paths = ensurePermissionRuntime(workspaceRoot)
  try {
    const parsed = JSON.parse(readFileSync(paths.stateFile, "utf-8")) as PermissionState
    return {
      schemaVersion: SCHEMA_VERSION,
      requests: Array.isArray(parsed.requests)
        ? parsed.requests.map((request) => normalizeRequest(request))
        : [],
      grants: Array.isArray(parsed.grants)
        ? parsed.grants.map((grant) => normalizeGrant(grant))
        : [],
    }
  } catch {
    return {
      schemaVersion: SCHEMA_VERSION,
      requests: [],
      grants: [],
    }
  }
}

function savePermissionState(workspaceRoot: string, state: PermissionState) {
  const paths = ensurePermissionRuntime(workspaceRoot)
  writeFileSync(
    paths.stateFile,
    JSON.stringify(
      {
        ...state,
        schemaVersion: SCHEMA_VERSION,
      } satisfies PermissionState,
      null,
      2,
    ),
  )
}

function normalizePathPrefix(targetPath: string, access: ElevatedPermissionAccess) {
  const resolved = resolve(targetPath)
  if (access === "write") {
    return existsSync(resolved) ? resolved : dirname(resolved)
  }
  if (existsSync(resolved)) {
    return resolved
  }
  return access === "run" ? dirname(resolved) : resolved
}

function normalizeSlash(value: string) {
  return value.replace(/\\/g, "/")
}

function isGlobPattern(value: string) {
  return /[*?[\]{}]/.test(value)
}

function globToRegex(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "::::DOUBLE_STAR::::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::::DOUBLE_STAR::::/g, ".*")
  return new RegExp(`^${escaped}$`)
}

function normalizePermissionPattern(options: {
  target: string
  access: ElevatedPermissionAccess
  workspaceRoot: string
  matcher?: ElevatedPermissionMatcher
}) {
  if (options.matcher === "glob" || (!options.matcher && isGlobPattern(options.target))) {
    const target = options.target.startsWith("/")
      ? options.target
      : resolve(options.workspaceRoot, options.target)
    return {
      matcher: "glob" as const,
      pattern: normalizeSlash(target),
    }
  }

  return {
    matcher: "prefix" as const,
    pattern: normalizePathPrefix(options.target, options.access),
  }
}

function normalizeGrant(grant: ElevatedPermissionGrant): ElevatedPermissionGrant {
  if (grant.matcher && grant.pattern) {
    return {
      ...grant,
      pattern: grant.matcher === "glob" ? normalizeSlash(grant.pattern) : resolve(grant.pattern),
    }
  }
  const pattern = normalizePathPrefix(grant.pathPrefix || ".", grant.access)
  return {
    ...grant,
    matcher: "prefix",
    pattern,
    pathPrefix: grant.pathPrefix || pattern,
  }
}

function normalizeRequest(request: ElevatedPermissionRequest): ElevatedPermissionRequest {
  if (request.matcher && request.pattern) {
    return {
      ...request,
      pattern:
        request.matcher === "glob" ? normalizeSlash(request.pattern) : resolve(request.pattern),
    }
  }
  const pattern = normalizePathPrefix(request.pathPrefix || ".", request.access)
  return {
    ...request,
    matcher: "prefix",
    pattern,
    pathPrefix: request.pathPrefix || pattern,
  }
}

function buildGrantId() {
  return `grant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildRequestId() {
  return `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function listElevatedPermissionRequests(
  workspaceRoot: string,
  status?: ElevatedPermissionRequestStatus,
) {
  const state = loadPermissionState(workspaceRoot)
  const requests = status
    ? state.requests.filter((request) => request.status === status)
    : state.requests
  return requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listElevatedPermissionGrants(workspaceRoot: string) {
  const state = loadPermissionState(workspaceRoot)
  return [...state.grants].sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))
}

export function createElevatedPermissionRequest(options: {
  workspaceRoot: string
  access: ElevatedPermissionAccess
  targetPath: string
  rawTarget: string
  toolName: string
  reason: string
  sessionId?: string
  requestedBy?: string
}) {
  const state = loadPermissionState(options.workspaceRoot)
  const normalized = normalizePermissionPattern({
    target: options.targetPath,
    access: options.access,
    workspaceRoot: options.workspaceRoot,
    matcher: "prefix",
  })
  const existing = state.requests.find((request) =>
    request.status === "pending" &&
    request.access === options.access &&
    request.matcher === normalized.matcher &&
    request.pattern === normalized.pattern &&
    request.toolName === options.toolName,
  )
  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  const request: ElevatedPermissionRequest = {
    id: buildRequestId(),
    status: "pending",
    access: options.access,
    matcher: normalized.matcher,
    pattern: normalized.pattern,
    pathPrefix: normalized.pattern,
    rawTarget: options.rawTarget,
    toolName: options.toolName,
    reason: options.reason,
    sessionId: options.sessionId,
    requestedBy: options.requestedBy,
    createdAt: now,
    updatedAt: now,
  }
  state.requests.unshift(request)
  savePermissionState(options.workspaceRoot, state)
  return request
}

export function approveElevatedPermissionRequest(options: {
  workspaceRoot: string
  requestId: string
  actor: string
}) {
  const state = loadPermissionState(options.workspaceRoot)
  const request = state.requests.find((entry) => entry.id === options.requestId)
  if (!request) {
    throw new Error(`permission request not found: ${options.requestId}`)
  }
  const now = new Date().toISOString()
  request.status = "approved"
  request.updatedAt = now
  request.resolvedBy = options.actor

  const existingGrant = state.grants.find((grant) =>
    grant.access === request.access &&
    grant.matcher === request.matcher &&
    grant.pattern === request.pattern,
  )
  if (existingGrant) {
    request.grantId = existingGrant.id
    savePermissionState(options.workspaceRoot, state)
    return { request, grant: existingGrant }
  }

  const grant: ElevatedPermissionGrant = {
    id: buildGrantId(),
    access: request.access,
    matcher: request.matcher,
    pattern: request.pattern,
    createdAt: now,
    approvedAt: now,
    approvedBy: options.actor,
    sourceRequestId: request.id,
    pathPrefix: request.matcher === "prefix" ? request.pattern : undefined,
  }
  request.grantId = grant.id
  state.grants.unshift(grant)
  savePermissionState(options.workspaceRoot, state)
  return { request, grant }
}

export function rejectElevatedPermissionRequest(options: {
  workspaceRoot: string
  requestId: string
  actor: string
}) {
  const state = loadPermissionState(options.workspaceRoot)
  const request = state.requests.find((entry) => entry.id === options.requestId)
  if (!request) {
    throw new Error(`permission request not found: ${options.requestId}`)
  }
  request.status = "rejected"
  request.updatedAt = new Date().toISOString()
  request.resolvedBy = options.actor
  savePermissionState(options.workspaceRoot, state)
  return request
}

export function createElevatedPermissionGrant(options: {
  workspaceRoot: string
  access: ElevatedPermissionAccess
  target: string
  actor: string
  matcher?: ElevatedPermissionMatcher
}) {
  const state = loadPermissionState(options.workspaceRoot)
  const normalized = normalizePermissionPattern({
    target: options.target,
    access: options.access,
    workspaceRoot: options.workspaceRoot,
    matcher: options.matcher,
  })
  const existing = state.grants.find((grant) =>
    grant.access === options.access &&
    grant.matcher === normalized.matcher &&
    grant.pattern === normalized.pattern,
  )
  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  const grant: ElevatedPermissionGrant = {
    id: buildGrantId(),
    access: options.access,
    matcher: normalized.matcher,
    pattern: normalized.pattern,
    createdAt: now,
    approvedAt: now,
    approvedBy: options.actor,
    pathPrefix: normalized.matcher === "prefix" ? normalized.pattern : undefined,
  }
  state.grants.unshift(grant)
  savePermissionState(options.workspaceRoot, state)
  return grant
}

export function revokeElevatedPermissionGrant(options: {
  workspaceRoot: string
  grantId: string
}) {
  const state = loadPermissionState(options.workspaceRoot)
  const index = state.grants.findIndex((grant) => grant.id === options.grantId)
  if (index < 0) {
    throw new Error(`permission grant not found: ${options.grantId}`)
  }
  const [grant] = state.grants.splice(index, 1)
  savePermissionState(options.workspaceRoot, state)
  return grant
}

export function isPathAllowedByGrant(options: {
  workspaceRoot: string
  access: ElevatedPermissionAccess
  targetPath: string
}) {
  const resolved = resolve(options.targetPath)
  const normalizedTarget = normalizeSlash(resolved)
  const state = loadPermissionState(options.workspaceRoot)
  return state.grants.some((grant) => {
    if (grant.access !== options.access) return false
    if (grant.matcher === "glob") {
      return globToRegex(grant.pattern).test(normalizedTarget)
    }
    const prefix = resolve(grant.pattern)
    return resolved === prefix || resolved.startsWith(`${prefix}/`)
  })
}

export function findAdminPrivateChatTargets(options: {
  workspaceRoot: string
  sessionsDir: string
  adminUsers: string[]
}) {
  const normalizedAdmins = new Set(
    options.adminUsers
      .map((entry) => entry.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  )
  if (!normalizedAdmins.size) return [] as Array<{ sessionId: string; chatId: number; username?: string }>
  const targets: Array<{ sessionId: string; chatId: number; username?: string }> = []
  if (!existsSync(options.sessionsDir)) return targets
  readdirSync(options.sessionsDir).forEach((name) => {
    const metadata = loadSessionMetadata(resolve(options.sessionsDir, name))
    if (!metadata) return
    const username = metadata.username?.trim().replace(/^@/, "").toLowerCase()
    const isPrivate = metadata.scope === "private" || metadata.chatType === "private"
    if (!isPrivate || !username || !normalizedAdmins.has(username)) return
    targets.push({
      sessionId: metadata.sessionId,
      chatId: metadata.chatId ?? 0,
      username: metadata.username,
    })
  })
  return targets
}
