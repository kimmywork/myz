import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import {
  buildWorkspaceId,
  normalizeWorkspaceRoot,
  resolveConfigPath,
  resolveRuntimeRoot,
} from "./config"
import { ensureMemoryDir } from "./memory"

const SOURCE_LAYOUT_VERSION = "legacy-root-v1"
const TARGET_LAYOUT_VERSION = "workspace-runtime-split-v1"

interface LayoutPathRecord {
  from: string
  to: string
}

interface LayoutMigrationRecord {
  sourceLayoutVersion: string
  targetLayoutVersion: string
  workspaceId: string
  workspaceRoot: string
  runtimeRoot: string
  startedAt: string
  completedAt: string
  movedPaths: LayoutPathRecord[]
  copiedPaths: LayoutPathRecord[]
  rollbackHints: string[]
}

export interface LayoutMigrationResult {
  status: "migrated" | "already_migrated" | "noop"
  workspaceRoot: string
  runtimeRoot: string
  workspaceId: string
  workspaceRuntimeRoot: string
  migrationFilePath: string
  movedPaths: LayoutPathRecord[]
  copiedPaths: LayoutPathRecord[]
}

function getWorkspaceRuntimeRoot(runtimeRoot: string, workspaceId: string) {
  return resolve(runtimeRoot, "workspaces", workspaceId)
}

function getMigrationFilePath(workspaceRuntimeRoot: string) {
  return resolve(workspaceRuntimeRoot, "system", "layout-migration.json")
}

function hasLegacyMemoryStorage(memoryDir: string) {
  return (
    existsSync(resolve(memoryDir, "index.json")) ||
    existsSync(resolve(memoryDir, "notes")) ||
    existsSync(resolve(memoryDir, "conversation-summaries"))
  )
}

function movePath(from: string, to: string) {
  mkdirSync(dirname(to), { recursive: true })
  const sourceStat = statSync(from)
  if (sourceStat.isDirectory()) {
    cpSync(from, to, { recursive: true, force: false, errorOnExist: true })
  } else {
    copyFileSync(from, to)
  }
  rmSync(from, { recursive: true, force: true })
}

export function migrateLegacyLayout(options: {
  workspaceRoot?: string
  runtimeRoot?: string
} = {}): LayoutMigrationResult {
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot)
  const runtimeRoot = resolve(options.runtimeRoot || resolveRuntimeRoot())
  const workspaceId = buildWorkspaceId(workspaceRoot)
  const workspaceRuntimeRoot = getWorkspaceRuntimeRoot(runtimeRoot, workspaceId)
  const migrationFilePath = getMigrationFilePath(workspaceRuntimeRoot)

  if (existsSync(migrationFilePath)) {
    const record = JSON.parse(readFileSync(migrationFilePath, "utf-8")) as LayoutMigrationRecord
    return {
      status: "already_migrated",
      workspaceRoot,
      runtimeRoot,
      workspaceId,
      workspaceRuntimeRoot,
      migrationFilePath,
      movedPaths: Array.isArray(record.movedPaths) ? record.movedPaths : [],
      copiedPaths: Array.isArray(record.copiedPaths) ? record.copiedPaths : [],
    }
  }

  const tasks: LayoutPathRecord[] = [
    {
      from: resolve(workspaceRoot, "bot.yml"),
      to: resolveConfigPath(runtimeRoot),
    },
    {
      from: resolve(workspaceRoot, "conversations"),
      to: resolve(workspaceRuntimeRoot, "conversations"),
    },
    {
      from: resolve(workspaceRoot, "permissions"),
      to: resolve(workspaceRuntimeRoot, "permissions"),
    },
    {
      from: resolve(workspaceRoot, "relationships"),
      to: resolve(workspaceRuntimeRoot, "relationships"),
    },
    {
      from: resolve(workspaceRoot, "soul"),
      to: resolve(workspaceRuntimeRoot, "soul"),
    },
  ].filter((entry) => existsSync(entry.from))

  const memoryDir = resolve(workspaceRoot, "memory")
  const shouldMigrateMemory = existsSync(memoryDir) && hasLegacyMemoryStorage(memoryDir)

  if (!tasks.length && !shouldMigrateMemory) {
    return {
      status: "noop",
      workspaceRoot,
      runtimeRoot,
      workspaceId,
      workspaceRuntimeRoot,
      migrationFilePath,
      movedPaths: [],
      copiedPaths: [],
    }
  }

  const conflicts = tasks
    .filter((entry) => existsSync(entry.to))
    .map((entry) => `${entry.from} -> ${entry.to}`)
  if (conflicts.length) {
    throw new Error(`layout migration conflicts:\n${conflicts.join("\n")}`)
  }

  mkdirSync(workspaceRuntimeRoot, { recursive: true })
  mkdirSync(resolve(workspaceRuntimeRoot, "system"), { recursive: true })

  tasks.forEach((entry) => {
    movePath(entry.from, entry.to)
  })

  const copiedPaths: LayoutPathRecord[] = []
  if (shouldMigrateMemory) {
    ensureMemoryDir(memoryDir)
    copiedPaths.push({
      from: resolve(workspaceRoot, "memory", "{index.json,notes,conversation-summaries}"),
      to: resolve(workspaceRoot, "memory", "YYYY-MM-DD.md"),
    })
  }

  const startedAt = new Date().toISOString()
  const completedAt = new Date().toISOString()
  const record: LayoutMigrationRecord = {
    sourceLayoutVersion: SOURCE_LAYOUT_VERSION,
    targetLayoutVersion: TARGET_LAYOUT_VERSION,
    workspaceId,
    workspaceRoot,
    runtimeRoot,
    startedAt,
    completedAt,
    movedPaths: tasks,
    copiedPaths,
    rollbackHints: [
      `将 runtime 文件从 ${runtimeRoot} 恢复到 ${workspaceRoot} 旧布局根目录。`,
      "如需回退 memory，请从版本控制或备份恢复迁移前的 memory 目录。",
    ],
  }
  writeFileSync(migrationFilePath, JSON.stringify(record, null, 2))

  return {
    status: "migrated",
    workspaceRoot,
    runtimeRoot,
    workspaceId,
    workspaceRuntimeRoot,
    migrationFilePath,
    movedPaths: tasks,
    copiedPaths,
  }
}

export function formatLayoutMigrationResult(result: LayoutMigrationResult) {
  if (result.status === "already_migrated") {
    return [
      "布局迁移已执行过，未重复迁移。",
      `workspace: ${result.workspaceRoot}`,
      `runtime: ${result.runtimeRoot}`,
      `migration: ${result.migrationFilePath}`,
    ].join("\n")
  }
  if (result.status === "noop") {
    return [
      "未发现需要迁移的旧布局内容。",
      `workspace: ${result.workspaceRoot}`,
      `runtime: ${result.runtimeRoot}`,
    ].join("\n")
  }
  return [
    "布局迁移完成。",
    `workspace: ${result.workspaceRoot}`,
    `runtime: ${result.runtimeRoot}`,
    `workspaceRuntime: ${result.workspaceRuntimeRoot}`,
    `movedPaths: ${result.movedPaths.length}`,
    `copiedPaths: ${result.copiedPaths.length}`,
    `migration: ${result.migrationFilePath}`,
  ].join("\n")
}
