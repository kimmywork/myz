import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { loadConfig } from "./config"
import { CURRENT_BOT_VERSION, compareVersions } from "./upgrade"

const RESTART_EXIT_CODE = 75
const LAUNCH_STATE_SCHEMA_VERSION = "1.0.0"
const HANDOFF_ACK_TIMEOUT_MS = 30_000
const RESTART_REQUEST_POLL_MS = 500
const WORKER_SHUTDOWN_GRACE_MS = 5_000

interface RestartRequestRecord {
  schemaVersion: string
  requestedAt: string
  reason?: string
  requestedBy?: string
  exitCode?: number
  targetVersion?: string | null
  packageName?: string | null
}

interface LaunchStateRecord {
  schemaVersion: string
  mode: "launcher"
  configPath: string
  workspaceRoot: string
  workspaceId: string
  runtimeRoot: string
  cwd: string
  command: string
  args: string[]
  envAllowlist: string[]
  createdAt: string
  updatedAt: string
  currentVersion: string
  supervisorPid: number
  workerPid: number | null
  restartCount: number
  status: "starting" | "running" | "restarting" | "exited"
  handoffToken: string | null
  lastExitCode: number | null
  lastExitSignal: string | null
  lastRestartReason: string | null
  lastRestartRequestedAt: string | null
  lastError: string | null
}

function getLaunchPaths(systemDir: string) {
  return {
    launchStatePath: resolve(systemDir, "launch.json"),
    restartRequestPath: resolve(systemDir, "restart-request.json"),
    handoffDir: resolve(systemDir, "handoffs"),
  }
}

function readRestartRequest(path: string): RestartRequestRecord | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RestartRequestRecord
  } catch {
    return null
  }
}

function readLaunchState(path: string): LaunchStateRecord | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as LaunchStateRecord
  } catch {
    return null
  }
}

function clearRestartRequest(path: string) {
  if (!existsSync(path)) return
  unlinkSync(path)
}

function buildEnvAllowlist() {
  return [
    "HOME",
    "PATH",
    "SHELL",
    "TMPDIR",
    "USER",
    "NODE_OPTIONS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ].filter((key) => Boolean(process.env[key]))
}

function writeLaunchState(options: {
  path: string
  configPath: string
  workspaceRoot: string
  workspaceId: string
  runtimeRoot: string
  supervisorPid: number
  workerPid?: number
  restartCount: number
  status: "starting" | "running" | "restarting" | "exited"
  handoffToken?: string
  lastExitCode?: number | null
  lastExitSignal?: string | null
  lastRestartReason?: string | null
  lastRestartRequestedAt?: string | null
  lastError?: string | null
}) {
  const existing = readLaunchState(options.path)
  const createdAt = existing?.createdAt || new Date().toISOString()
  const payload: LaunchStateRecord = {
    schemaVersion: LAUNCH_STATE_SCHEMA_VERSION,
    mode: "launcher",
    configPath: options.configPath,
    workspaceRoot: options.workspaceRoot,
    workspaceId: options.workspaceId,
    runtimeRoot: options.runtimeRoot,
    cwd: process.cwd(),
    command: process.execPath,
    args: process.argv.slice(1),
    envAllowlist: buildEnvAllowlist(),
    createdAt,
    updatedAt: new Date().toISOString(),
    currentVersion: CURRENT_BOT_VERSION,
    supervisorPid: options.supervisorPid,
    workerPid: options.workerPid || null,
    restartCount: options.restartCount,
    status: options.status,
    handoffToken: options.handoffToken || null,
    lastExitCode: options.lastExitCode ?? null,
    lastExitSignal: options.lastExitSignal ?? null,
    lastRestartReason: options.lastRestartReason ?? null,
    lastRestartRequestedAt: options.lastRestartRequestedAt ?? null,
    lastError: options.lastError ?? null,
  }
  writeFileSync(options.path, JSON.stringify(payload, null, 2))
}

function getHandoffAckPath(handoffDir: string, token: string) {
  return resolve(handoffDir, `${token}.json`)
}

function acknowledgeHandoff(handoffDir: string, token: string, workerPid?: number) {
  mkdirSync(handoffDir, { recursive: true })
  writeFileSync(
    getHandoffAckPath(handoffDir, token),
    JSON.stringify(
      {
        token,
        acknowledgedAt: new Date().toISOString(),
        supervisorPid: process.pid,
        workerPid: workerPid || null,
        version: CURRENT_BOT_VERSION,
      },
      null,
      2,
    ),
  )
}

async function waitForHandoffAck(handoffDir: string, token: string) {
  const ackPath = getHandoffAckPath(handoffDir, token)
  const deadline = Date.now() + HANDOFF_ACK_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (existsSync(ackPath)) {
      return true
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  return false
}

function createRestartRequestWatcher(child: ChildProcess, restartRequestPath: string) {
  let handled = false
  const interval = setInterval(() => {
    if (handled) return
    const request = readRestartRequest(restartRequestPath)
    if (!request) return
    handled = true
    try {
      child.kill("SIGTERM")
    } catch {
      return
    }
    const forceTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        return
      }
    }, WORKER_SHUTDOWN_GRACE_MS)
    forceTimer.unref?.()
    child.once("exit", () => clearTimeout(forceTimer))
  }, RESTART_REQUEST_POLL_MS)
  interval.unref?.()
  return () => clearInterval(interval)
}

async function spawnWorker(childArgs: string[]) {
  return await new Promise<ChildProcess>((resolveChild, reject) => {
    const child = spawn(process.execPath, childArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        MYZ_BOT_VERSION: CURRENT_BOT_VERSION,
      },
    })
    child.on("error", reject)
    child.once("spawn", () => resolveChild(child))
  })
}

async function waitForChildExit(child: ChildProcess) {
  return await new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      resolveExit({
        code: code ?? 0,
        signal,
      })
    })
  })
}

async function spawnUpgradeLauncher(options: {
  packageName: string
  targetVersion: string
  workspaceRoot: string
  handoffToken: string
}) {
  return await new Promise<ChildProcess>((resolveChild, reject) => {
    const child = spawn(
      "npx",
      [
        "-y",
        `${options.packageName}@${options.targetVersion}`,
        "launch",
        "-w",
        options.workspaceRoot,
        "--handoff",
        options.handoffToken,
      ],
      {
        stdio: "inherit",
        env: process.env,
      },
    )
    child.on("error", reject)
    child.once("spawn", () => resolveChild(child))
  })
}

function shouldHandoffUpgrade(
  restartRequest: RestartRequestRecord | null,
  defaultPackageName: string,
) {
  const targetVersion = restartRequest?.targetVersion?.trim() || ""
  if (!targetVersion) return null
  if (compareVersions(targetVersion, CURRENT_BOT_VERSION) <= 0) return null
  return {
    targetVersion,
    packageName: restartRequest?.packageName?.trim() || defaultPackageName,
  }
}

export async function launchBot(options: {
  workspaceRoot?: string
  runtimeRoot?: string
  handoffToken?: string
} = {}) {
  const entryFile = process.argv[1]
  if (!entryFile) {
    throw new Error("unable to resolve launcher entry file")
  }
  const config = loadConfig({
    workspaceRoot: options.workspaceRoot,
    runtimeRoot: options.runtimeRoot,
  })
  mkdirSync(config.systemDir, { recursive: true })
  const configPath = resolve(config.runtimeRoot, "bot.yml")
  const { launchStatePath, restartRequestPath, handoffDir } = getLaunchPaths(config.systemDir)

  const childArgs = [entryFile, "serve", "-w", config.workspaceRoot]
  let restartCount = 0

  writeLaunchState({
    path: launchStatePath,
    configPath,
    workspaceRoot: config.workspaceRoot,
    workspaceId: config.workspaceId,
    runtimeRoot: config.runtimeRoot,
    supervisorPid: process.pid,
    restartCount,
    status: "starting",
    handoffToken: options.handoffToken,
  })

  while (true) {
    clearRestartRequest(restartRequestPath)
    const child = await spawnWorker(childArgs)
    const stopWatching = createRestartRequestWatcher(child, restartRequestPath)

    writeLaunchState({
      path: launchStatePath,
      configPath,
      workspaceRoot: config.workspaceRoot,
      workspaceId: config.workspaceId,
      runtimeRoot: config.runtimeRoot,
      supervisorPid: process.pid,
      workerPid: child.pid,
      restartCount,
      status: "running",
      handoffToken: options.handoffToken,
    })

    if (options.handoffToken) {
      acknowledgeHandoff(handoffDir, options.handoffToken, child.pid)
      options.handoffToken = undefined
    }

    const exit = await waitForChildExit(child)
    stopWatching()

    const restartRequest = readRestartRequest(restartRequestPath)
    const shouldRestart = exit.code === RESTART_EXIT_CODE || Boolean(restartRequest)

    if (shouldRestart) {
      const upgradeTarget = shouldHandoffUpgrade(restartRequest, config.upgrade.packageName)
      if (upgradeTarget) {
        const handoffToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        try {
          await spawnUpgradeLauncher({
            packageName: upgradeTarget.packageName,
            targetVersion: upgradeTarget.targetVersion,
            workspaceRoot: config.workspaceRoot,
            handoffToken,
          })
          const handoffReady = await waitForHandoffAck(handoffDir, handoffToken)
          if (handoffReady) {
            rmSync(getHandoffAckPath(handoffDir, handoffToken), { force: true })
            writeLaunchState({
              path: launchStatePath,
              configPath,
              workspaceRoot: config.workspaceRoot,
              workspaceId: config.workspaceId,
              runtimeRoot: config.runtimeRoot,
              supervisorPid: process.pid,
              restartCount,
              status: "exited",
              lastExitCode: exit.code,
              lastExitSignal: exit.signal,
              lastRestartReason: `upgrade_handoff:${upgradeTarget.targetVersion}`,
              lastRestartRequestedAt: restartRequest?.requestedAt || null,
            })
            process.exitCode = 0
            return
          }
          writeLaunchState({
            path: launchStatePath,
            configPath,
            workspaceRoot: config.workspaceRoot,
            workspaceId: config.workspaceId,
            runtimeRoot: config.runtimeRoot,
            supervisorPid: process.pid,
            restartCount,
            status: "restarting",
            lastExitCode: exit.code,
            lastExitSignal: exit.signal,
            lastRestartReason: restartRequest?.reason || "upgrade_apply",
            lastRestartRequestedAt: restartRequest?.requestedAt || null,
            lastError: `upgrade handoff timed out for ${upgradeTarget.targetVersion}`,
          })
          restartCount += 1
          continue
        } catch (error) {
          writeLaunchState({
            path: launchStatePath,
            configPath,
            workspaceRoot: config.workspaceRoot,
            workspaceId: config.workspaceId,
            runtimeRoot: config.runtimeRoot,
            supervisorPid: process.pid,
            restartCount,
            status: "restarting",
            lastExitCode: exit.code,
            lastExitSignal: exit.signal,
            lastRestartReason: restartRequest?.reason || "upgrade_apply",
            lastRestartRequestedAt: restartRequest?.requestedAt || null,
            lastError: (error as Error).message,
          })
          restartCount += 1
          continue
        }
      }

      restartCount += 1
      writeLaunchState({
        path: launchStatePath,
        configPath,
        workspaceRoot: config.workspaceRoot,
        workspaceId: config.workspaceId,
        runtimeRoot: config.runtimeRoot,
        supervisorPid: process.pid,
        restartCount,
        status: "restarting",
        lastExitCode: exit.code,
        lastExitSignal: exit.signal,
        lastRestartReason:
          restartRequest?.reason || (exit.code === RESTART_EXIT_CODE ? "exit_code_75" : "requested"),
        lastRestartRequestedAt: restartRequest?.requestedAt || null,
      })
      continue
    }

    writeLaunchState({
      path: launchStatePath,
      configPath,
      workspaceRoot: config.workspaceRoot,
      workspaceId: config.workspaceId,
      runtimeRoot: config.runtimeRoot,
      supervisorPid: process.pid,
      restartCount,
      status: "exited",
      lastExitCode: exit.code,
      lastExitSignal: exit.signal,
    })
    process.exitCode = exit.code
    return
  }
}
