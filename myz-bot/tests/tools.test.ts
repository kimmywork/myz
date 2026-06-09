import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureSessionDir,
  getSessionHistoryPath,
  saveSessionMetadata,
} from "../src/sessions"
import { getBuiltinSkillSource } from "../src/builtinSkills"
import {
  approveElevatedPermissionRequest,
  createElevatedPermissionGrant,
  listElevatedPermissionRequests,
  revokeElevatedPermissionGrant,
} from "../src/elevatedPermissions"
import { createLocalTools } from "../src/tools"

function extractText(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .map((item) => (item.type === "text" ? item.text || "" : ""))
    .join("\n")
}

test("createLocalTools does not expose Remember in the default tool surface", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir: join(root, "sessions"),
  })

  assert.equal(registry.definitions.some((tool) => tool.name === "Remember"), false)
  assert.equal("Remember" in registry.handlers, false)
  assert.equal(registry.definitions.some((tool) => tool.name === "ListKnownContacts"), false)
  assert.equal(registry.definitions.some((tool) => tool.name === "SendMessageToContact"), false)
  assert.equal("ListKnownContacts" in registry.handlers, false)
  assert.equal("SendMessageToContact" in registry.handlers, false)
})

test("external path access is blocked by default", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-external-"))
  const externalFile = join(externalDir, "note.txt")
  writeFileSync(externalFile, "outside workspace")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: externalFile,
  })

  assert.equal(result.isError, true)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /路径不在允许范围内/)
})

test("access policy allows configured external paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-external-"))
  const externalFile = join(externalDir, "note.txt")
  writeFileSync(externalFile, "allowed content")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
    accessPolicy: {
      allowedPaths: [externalDir],
    },
  })

  const result = await registry.handlers.Read({
    path: externalFile,
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /allowed content/)
})

test("Run resolves  virtual paths inside shell commands", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const sessionId = "100-1"
  const repoDir = join(root, "kimici")
  mkdirSync(repoDir, { recursive: true })
  writeFileSync(join(repoDir, "README.md"), "hello")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Run({
    __sessionId: sessionId,
    command: "cd kimici && pwd && ls -la && sed -n '1,20p' README.md",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /STDOUT:/)
  assert.match(text, /kimici/)
  assert.match(text, /hello/)
  assert.doesNotMatch(text, /已创建授权请求/)
})

test("Write creates file in workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Write({
    path: "project/a.md",
    content: "# A\n",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /写入完成/)
  assert.equal(readFileSync(join(root, "project", "a.md"), "utf-8"), "# A\n")
})

test("Write batch validates all paths before writing to avoid partial success", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const sessionId = "100-1"
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-write-batch-"))
  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Write({
    __sessionId: sessionId,
    files: [
      {
        path: "project/a.md",
        content: "# A\n",
      },
      {
        path: join(externalDir, "b.md"),
        content: "# B\n",
      },
    ],
  })

  assert.equal(result.isError, true)
  assert.equal(existsSync(join(root, "project", "a.md")), false)
})

test("Read can access workspace files through  virtual path without reinjecting root AGENTS", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const memoryDir = join(root, "memory")
  mkdirSync(memoryDir, { recursive: true })
  writeFileSync(join(memoryDir, "note.txt"), "from bot root")
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS.md\n\n- bot 根目录规则")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir,
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: "memory/note.txt",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /bot 根目录规则/)
  assert.match(text, /from bot root/)
})

test("List shows directory contents", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const projectDir = join(root, "repo")
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, "AGENTS.md"), "# AGENTS.md\n\n- repo 目录规则")
  writeFileSync(join(projectDir, "a.txt"), "a")
  writeFileSync(join(projectDir, "b.txt"), "b")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.List({
    path: "repo",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /AGENTS\.md/)
  assert.match(text, /a\.txt/)
  assert.match(text, /b\.txt/)
})

test("Read keeps nested AGENTS context but does not duplicate the AGENTS file itself", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const projectDir = join(root, "repo")
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, "AGENTS.md"), "# AGENTS.md\n\n- repo 目录规则")
  writeFileSync(join(projectDir, "note.txt"), "nested note")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const nestedFile = await registry.handlers.Read({
    path: "repo/note.txt",
    __sessionId: "100-1",
  })
  const nestedText = extractText(nestedFile as { content: Array<{ type: string; text?: string }> })
  assert.match(nestedText, /\[AGENTS instructions from/)
  assert.match(nestedText, /repo 目录规则/)
  assert.match(nestedText, /nested note/)

  const agentsFile = await registry.handlers.Read({
    path: "repo/AGENTS.md",
    __sessionId: "100-1",
  })
  const agentsText = extractText(agentsFile as { content: Array<{ type: string; text?: string }> })
  assert.equal(agentsText.match(/repo 目录规则/g)?.length, 1)
})

test("Read reads file from workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  writeFileSync(join(root, "note.txt"), "workspace note")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: "note.txt",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /workspace note/)
})

test("Read does not inject parent AGENTS outside workspace root", async () => {
  const parent = mkdtempSync(join(tmpdir(), "myz-bot-tools-parent-"))
  const root = join(parent, "workspace")
  mkdirSync(root, { recursive: true })
  const sessionsDir = join(root, "sessions")
  writeFileSync(join(parent, "AGENTS.md"), "# AGENTS.md\n\n- 父目录规则")
  writeFileSync(join(root, "note.txt"), "inside workspace")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: "note.txt",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /父目录规则/)
  assert.match(text, /inside workspace/)
})

test("Read can access workspace files", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  writeFileSync(join(root, "test.md"), "# Test\n\nTask.init test")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: "test.md",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /Task\.init/)
})

