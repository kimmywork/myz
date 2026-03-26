import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { BotRuntimeConfig } from "./config"
import { requestProcessRestart } from "./maintenance"

const UPGRADE_STATE_SCHEMA_VERSION = "1.0.0"

export type LaunchMode = "launcher" | "direct-ephemeral" | "direct-pinned"
export type UpgradeStatus =
  | "idle"
  | "disabled"
  | "up_to_date"
  | "available"
  | "pending_apply"
  | "error"

export interface UpgradeStateRecord {
  schemaVersion: string
  currentVersion: string
  currentMode: LaunchMode
  lastCheckedAt: string | null
  lastKnownVersion: string | null
  pendingVersion: string | null
  status: UpgradeStatus
  lastError: string | null
  updatedAt: string
}

interface LaunchStateRecord {
  status?: string
  supervisorPid?: number | null
}

interface PackageRegistryPayload {
  "dist-tags"?: {
    latest?: string
  }
  versions?: Record<string, unknown>
}

type FetchLike = typeof fetch

function getUpgradeStatePath(systemDir: string) {
  return resolve(systemDir, "upgrade-state.json")
}

function getLaunchStatePath(systemDir: string) {
  return resolve(systemDir, "launch.json")
}

function resolveEntryCandidates() {
  const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
  const modulePath = fileURLToPath(import.meta.url)
  const entryDir = entryPath ? dirname(entryPath) : ""
  const moduleDir = dirname(modulePath)
  return Array.from(
    new Set(
      [entryDir, moduleDir]
        .filter(Boolean)
        .flatMap((dir) => [resolve(dir, "package.json"), resolve(dir, "..", "package.json")]),
    ),
  )
}

function resolveCurrentVersion() {
  const envVersion = process.env.MYZ_BOT_VERSION?.trim() || process.env.npm_package_version?.trim()
  if (envVersion) return envVersion
  for (const candidate of resolveEntryCandidates()) {
    if (!existsSync(candidate)) continue
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf-8")) as {
        version?: unknown
      }
      if (typeof parsed.version === "string" && parsed.version.trim()) {
        return parsed.version.trim()
      }
    } catch {
      continue
    }
  }
  return "0.0.0"
}

export const CURRENT_BOT_VERSION = resolveCurrentVersion()

function parseSemver(value: string) {
  const normalized = value.trim()
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized)
  if (!match) return null
  return {
    raw: normalized.startsWith("v") ? normalized.slice(1) : normalized,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  }
}

export function compareVersions(left: string, right: string) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) {
    return left.localeCompare(right)
  }
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  if (!a.prerelease.length && !b.prerelease.length) return 0
  if (!a.prerelease.length) return 1
  if (!b.prerelease.length) return -1
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart - rightPart
    }
    if (typeof leftPart === "number") return -1
    if (typeof rightPart === "number") return 1
    return String(leftPart).localeCompare(String(rightPart))
  }
  return 0
}

export function isPrereleaseVersion(value: string) {
  return parseSemver(value)?.prerelease.length ? true : false
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T
  } catch {
    return null
  }
}

function writeUpgradeState(systemDir: string, state: UpgradeStateRecord) {
  mkdirSync(systemDir, { recursive: true })
  writeFileSync(getUpgradeStatePath(systemDir), JSON.stringify(state, null, 2))
  return state
}

function createDefaultUpgradeState(mode: LaunchMode): UpgradeStateRecord {
  return {
    schemaVersion: UPGRADE_STATE_SCHEMA_VERSION,
    currentVersion: CURRENT_BOT_VERSION,
    currentMode: mode,
    lastCheckedAt: null,
    lastKnownVersion: null,
    pendingVersion: null,
    status: "idle",
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}

function isProcessAlive(pid: number | null | undefined) {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isLauncherStateActive(state: LaunchStateRecord | null) {
  if (!state) return false
  if (!["starting", "running", "restarting"].includes(state.status || "")) return false
  return isProcessAlive(state.supervisorPid || null)
}

function detectCurrentProcessLaunchMode(): LaunchMode {
  const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
  const normalized = `${sep}${entryPath}${sep}`
  if (normalized.includes(`${sep}_npx${sep}`) || normalized.includes(`${sep}npm-exec${sep}`)) {
    return "direct-ephemeral"
  }
  const tempRoot = resolve(tmpdir())
  if (entryPath && entryPath.startsWith(tempRoot)) {
    return "direct-ephemeral"
  }
  return "direct-pinned"
}

export function resolveLaunchMode(systemDir: string): LaunchMode {
  const launchState = readJsonFile<LaunchStateRecord>(getLaunchStatePath(systemDir))
  if (isLauncherStateActive(launchState)) {
    return "launcher"
  }
  return detectCurrentProcessLaunchMode()
}

export function readUpgradeState(systemDir: string) {
  return readJsonFile<UpgradeStateRecord>(getUpgradeStatePath(systemDir))
}

export function syncUpgradeState(config: BotRuntimeConfig, mode = resolveLaunchMode(config.systemDir)) {
  const existing = readUpgradeState(config.systemDir)
  const next = {
    ...createDefaultUpgradeState(mode),
    ...(existing || {}),
    schemaVersion: UPGRADE_STATE_SCHEMA_VERSION,
    currentVersion: CURRENT_BOT_VERSION,
    currentMode: mode,
    updatedAt: new Date().toISOString(),
  } satisfies UpgradeStateRecord

  if (next.pendingVersion && compareVersions(CURRENT_BOT_VERSION, next.pendingVersion) >= 0) {
    next.pendingVersion = null
  }

  if (!config.upgrade.enabled) {
    next.status = "disabled"
    next.lastError = null
  } else if (next.pendingVersion) {
    next.status = "pending_apply"
  } else if (next.lastKnownVersion) {
    next.status =
      compareVersions(next.lastKnownVersion, CURRENT_BOT_VERSION) > 0
        ? "available"
        : "up_to_date"
  } else if (next.status !== "error") {
    next.status = "idle"
  }

  return writeUpgradeState(config.systemDir, next)
}

async function resolveTargetVersion(
  config: BotRuntimeConfig,
  fetchImpl: FetchLike,
): Promise<string> {
  const channel = config.upgrade.channel.trim()
  if (channel !== "latest") {
    if (!parseSemver(channel)) {
      throw new Error(`unsupported upgrade channel: ${channel}`)
    }
    if (!config.upgrade.allowPrerelease && isPrereleaseVersion(channel)) {
      throw new Error(`prerelease channel requires upgrade.allowPrerelease=true: ${channel}`)
    }
    return channel
  }

  const packageName = config.upgrade.packageName.trim()
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
  const response = await fetchImpl(registryUrl, {
    headers: {
      accept: "application/vnd.npm.install-v1+json, application/json",
    },
  })
  if (!response.ok) {
    throw new Error(`npm registry request failed: ${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as PackageRegistryPayload
  const versions = Object.keys(payload.versions || {}).filter((value) => parseSemver(value))
  const latestTag = String(payload["dist-tags"]?.latest || "").trim()
  const latestStable = versions
    .filter((value) => config.upgrade.allowPrerelease || !isPrereleaseVersion(value))
    .sort((left, right) => compareVersions(left, right))
  const latestStableVersion =
    latestStable.length > 0 ? latestStable[latestStable.length - 1] : undefined

  const candidate =
    config.upgrade.allowPrerelease || !isPrereleaseVersion(latestTag)
      ? latestTag || latestStableVersion || ""
      : latestStableVersion || ""

  if (!candidate) {
    throw new Error(`unable to resolve latest version for ${packageName}`)
  }
  return candidate
}

export async function checkForUpgrade(options: {
  config: BotRuntimeConfig
  fetchImpl?: FetchLike
}) {
  const fetchImpl = options.fetchImpl || fetch
  const mode = resolveLaunchMode(options.config.systemDir)
  const state = syncUpgradeState(options.config, mode)

  if (!options.config.upgrade.enabled) {
    return {
      updateAvailable: false,
      targetVersion: null,
      state,
    }
  }

  try {
    const targetVersion = await resolveTargetVersion(options.config, fetchImpl)
    const updateAvailable = compareVersions(targetVersion, CURRENT_BOT_VERSION) > 0
    const next = writeUpgradeState(options.config.systemDir, {
      ...state,
      currentMode: mode,
      lastCheckedAt: new Date().toISOString(),
      lastKnownVersion: targetVersion,
      pendingVersion:
        state.pendingVersion && compareVersions(CURRENT_BOT_VERSION, state.pendingVersion) < 0
          ? state.pendingVersion
          : null,
      status:
        state.pendingVersion && compareVersions(CURRENT_BOT_VERSION, state.pendingVersion) < 0
          ? "pending_apply"
          : updateAvailable
            ? "available"
            : "up_to_date",
      lastError: null,
      updatedAt: new Date().toISOString(),
    })

    return {
      updateAvailable,
      targetVersion: updateAvailable ? targetVersion : null,
      state: next,
    }
  } catch (error) {
    const next = writeUpgradeState(options.config.systemDir, {
      ...state,
      currentMode: mode,
      lastCheckedAt: new Date().toISOString(),
      status: "error",
      lastError: (error as Error).message,
      updatedAt: new Date().toISOString(),
    })
    throw Object.assign(error as Error, {
      upgradeState: next,
    })
  }
}

function formatApplyModeError(mode: LaunchMode) {
  if (mode === "direct-ephemeral") {
    return "当前是 direct-ephemeral 模式，不能无人值守升级。请改用 `myz-bot launch -w <workspace>`。"
  }
  return "当前不是 launcher 模式，不能自动 apply 升级。请改用 `myz-bot launch -w <workspace>`。"
}

export async function applyUpgrade(options: {
  config: BotRuntimeConfig
  requestedBy: string
  scheduleExit?: boolean
  fetchImpl?: FetchLike
}) {
  const mode = resolveLaunchMode(options.config.systemDir)
  const state = syncUpgradeState(options.config, mode)

  if (!options.config.upgrade.enabled) {
    return {
      ok: false,
      message: "当前 bot.yml 已禁用升级检查。",
      state,
    }
  }

  if (mode !== "launcher") {
    return {
      ok: false,
      message: formatApplyModeError(mode),
      state,
    }
  }

  const checked = await checkForUpgrade({
    config: options.config,
    fetchImpl: options.fetchImpl,
  })

  if (!checked.updateAvailable || !checked.targetVersion) {
    return {
      ok: false,
      message: `当前已经是最新版本：${checked.state.currentVersion}`,
      state: checked.state,
    }
  }

  if (checked.state.pendingVersion === checked.targetVersion) {
    return {
      ok: false,
      message: `升级请求已经排队：${checked.targetVersion}`,
      state: checked.state,
    }
  }

  const nextState = writeUpgradeState(options.config.systemDir, {
    ...checked.state,
    pendingVersion: checked.targetVersion,
    status: "pending_apply",
    lastError: null,
    updatedAt: new Date().toISOString(),
  })

  requestProcessRestart({
    scheduleExit: options.scheduleExit !== false,
    requestFilePath: resolve(options.config.systemDir, "restart-request.json"),
    reason: "upgrade_apply",
    requestedBy: options.requestedBy,
    targetVersion: checked.targetVersion,
    packageName: options.config.upgrade.packageName,
  })

  return {
    ok: true,
    message:
      options.scheduleExit === false
        ? `已写入升级请求：${checked.targetVersion}。launcher 会接管后续重启。`
        : `已请求升级到 ${checked.targetVersion}，launcher 会接管重启。`,
    state: nextState,
  }
}

export function formatUpgradeStatus(state: UpgradeStateRecord) {
  return [
    "升级状态：",
    `- currentVersion: ${state.currentVersion}`,
    `- currentMode: ${state.currentMode}`,
    `- status: ${state.status}`,
    `- lastKnownVersion: ${state.lastKnownVersion || "-"}`,
    `- pendingVersion: ${state.pendingVersion || "-"}`,
    `- lastCheckedAt: ${state.lastCheckedAt || "-"}`,
    `- lastError: ${state.lastError || "-"}`,
  ].join("\n")
}
