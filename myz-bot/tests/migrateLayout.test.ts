import { test } from "node:test"
import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildWorkspaceId } from "../src/config"
import { migrateLegacyLayout } from "../src/migrateLayout"

test("migrateLegacyLayout moves legacy runtime directories and writes migration record", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-migrate-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const memoryDir = join(workspaceRoot, "memory")

  writeFileSync(
    join(workspaceRoot, "bot.yml"),
    [
      "telegram:",
      "  username: legacybot",
      "  token: legacy-token",
      "ai:",
      "  provider: openai_compatible",
      "  model: legacy-model",
    ].join("\n"),
  )
  writeFileSync(join(workspaceRoot, "AGENTS.md"), "# AGENTS.md\n")
  writeFileSync(join(workspaceRoot, "SOUL.md"), "# SOUL.md\n")
  mkdirSync(join(workspaceRoot, "conversations", "c1"), { recursive: true })
  writeFileSync(join(workspaceRoot, "conversations", "c1", "metadata.json"), "{}")
  mkdirSync(join(workspaceRoot, "permissions"), { recursive: true })
  writeFileSync(join(workspaceRoot, "permissions", "index.json"), "{}")
  mkdirSync(join(workspaceRoot, "relationships"), { recursive: true })
  writeFileSync(join(workspaceRoot, "relationships", "index.json"), "[]")
  mkdirSync(join(workspaceRoot, "soul"), { recursive: true })
  writeFileSync(join(workspaceRoot, "soul", "audit.jsonl"), "")
  mkdirSync(join(memoryDir, "notes"), { recursive: true })
  mkdirSync(join(memoryDir, "conversation-summaries"), { recursive: true })
  writeFileSync(join(memoryDir, "notes", "mem-1.md"), "# 偏好\n\n用户偏好简洁。\n")
  writeFileSync(
    join(memoryDir, "index.json"),
    JSON.stringify(
      {
        items: [
          {
            id: "mem-1",
            title: "偏好",
            tags: ["conversation:c1"],
            createdAt: "2026-03-26T08:00:00.000Z",
            file: join(memoryDir, "notes", "mem-1.md"),
          },
        ],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(memoryDir, "conversation-summaries", "c1.md"),
    "会话压缩摘要\n\n用户最近在收敛 bot 结构。",
  )

  const result = migrateLegacyLayout({
    workspaceRoot,
    runtimeRoot,
  })

  const workspaceId = buildWorkspaceId(result.workspaceRoot)
  const workspaceRuntimeRoot = join(runtimeRoot, "workspaces", workspaceId)
  const migrationFile = join(workspaceRuntimeRoot, "system", "layout-migration.json")

  assert.equal(result.status, "migrated")
  assert.equal(existsSync(join(runtimeRoot, "bot.yml")), true)
  assert.equal(existsSync(join(workspaceRoot, "bot.yml")), false)
  assert.equal(existsSync(join(workspaceRuntimeRoot, "conversations", "c1", "metadata.json")), true)
  assert.equal(existsSync(join(workspaceRuntimeRoot, "permissions", "index.json")), true)
  assert.equal(existsSync(join(workspaceRuntimeRoot, "relationships", "index.json")), true)
  assert.equal(existsSync(join(workspaceRuntimeRoot, "soul", "audit.jsonl")), true)
  assert.equal(existsSync(join(workspaceRoot, "AGENTS.md")), true)
  assert.equal(existsSync(join(workspaceRoot, "SOUL.md")), true)
  assert.equal(existsSync(migrationFile), true)

  const migration = JSON.parse(readFileSync(migrationFile, "utf-8")) as {
    workspaceId?: string
    movedPaths?: Array<{ from?: string; to?: string }>
    copiedPaths?: Array<{ from?: string; to?: string }>
  }
  assert.equal(migration.workspaceId, workspaceId)
  assert.equal(Array.isArray(migration.movedPaths), true)
  assert.equal(Array.isArray(migration.copiedPaths), true)
  assert.equal(migration.movedPaths?.length, 5)

  assert.equal(existsSync(join(memoryDir, "index.json")), false)
  assert.equal(existsSync(join(memoryDir, "notes")), false)
  assert.equal(existsSync(join(memoryDir, "conversation-summaries")), false)
  const dailyLogs = readdirSync(memoryDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  assert.equal(dailyLogs.length >= 1, true)
  const memoryContent = dailyLogs
    .map((name) => readFileSync(join(memoryDir, name), "utf-8"))
    .join("\n")
  assert.match(memoryContent, /用户偏好简洁/)
  assert.match(memoryContent, /会话摘要 c1/)
})

test("migrateLegacyLayout is idempotent after a successful migration", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-migrate-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  writeFileSync(
    join(workspaceRoot, "bot.yml"),
    [
      "telegram:",
      "  username: legacybot",
      "  token: legacy-token",
      "ai:",
      "  provider: openai_compatible",
      "  model: legacy-model",
    ].join("\n"),
  )

  const first = migrateLegacyLayout({
    workspaceRoot,
    runtimeRoot,
  })
  const second = migrateLegacyLayout({
    workspaceRoot,
    runtimeRoot,
  })

  assert.equal(first.status, "migrated")
  assert.equal(second.status, "already_migrated")
})
