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

test("external path access creates permission request, notifies admin, and works after approval", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const adminDir = ensureSessionDir(sessionsDir, "300-3")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-external-"))
  const externalFile = join(externalDir, "note.txt")
  writeFileSync(join(externalDir, "AGENTS.md"), "# AGENTS.md\n\n- 外部目录规则")
  writeFileSync(externalFile, "outside workspace")

  saveSessionMetadata(adminDir, {
    schemaVersion: "1.0.0",
    sessionId: "300-3",
    chatId: 300,
    userId: 3,
    scope: "private",
    chatType: "private",
    username: "admin",
    firstName: "Admin",
    lastName: "",
    lastActorDisplayName: "Admin (@admin)",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const sent: Array<{ chatId: number; text: string }> = []
  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
    channel: {
      sendMessage: async (chatId: any, text: any) => {
        sent.push({ chatId, text })
        return []
      },
    },
  })

  const first = await registry.handlers.Read({
    path: externalFile,
    __sessionId: "300-3",
  })

  assert.equal(first.isError, true)
  const firstText = extractText(first as { content: Array<{ type: string; text?: string }> })
  assert.match(firstText, /已创建授权请求/)
  const requests = listElevatedPermissionRequests(root, "pending")
  assert.equal(requests.length, 1)

  approveElevatedPermissionRequest({
    workspaceRoot: root,
    requestId: requests[0]!.id,
    actor: "admin",
  })

  const second = await registry.handlers.Read({
    path: externalFile,
    __sessionId: "300-3",
  })

  assert.equal(second.isError, undefined)
  const secondText = extractText(second as { content: Array<{ type: string; text?: string }> })
  assert.match(secondText, /\[AGENTS instructions from/)
  assert.match(secondText, /外部目录规则/)
  assert.match(secondText, /outside workspace/)
})

test("manual prefix grant allows subtree access and revoke removes it", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-prefix-"))
  const nestedDir = join(externalDir, "docs")
  const externalFile = join(nestedDir, "note.txt")
  mkdirSync(nestedDir, { recursive: true })
  writeFileSync(join(externalDir, "AGENTS.md"), "# AGENTS.md\n\n- 前缀目录规则")
  writeFileSync(externalFile, "prefix grant")

  const grant = createElevatedPermissionGrant({
    workspaceRoot: root,
    access: "read",
    target: externalDir,
    actor: "admin",
  })

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const allowed = await registry.handlers.Read({
    path: externalFile,
    __sessionId: "100-1",
  })
  assert.equal(allowed.isError, undefined)
  const allowedText = extractText(allowed as { content: Array<{ type: string; text?: string }> })
  assert.match(allowedText, /前缀目录规则/)
  assert.match(allowedText, /prefix grant/)

  revokeElevatedPermissionGrant({
    workspaceRoot: root,
    grantId: grant.id,
  })

  const denied = await registry.handlers.Read({
    path: externalFile,
    __sessionId: "100-1",
  })
  assert.equal(denied.isError, true)
  assert.match(
    extractText(denied as { content: Array<{ type: string; text?: string }> }),
    /已创建授权请求/,
  )
})

test("manual glob grant allows matching files without opening the whole directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-glob-"))
  const allowedFile = join(externalDir, "notes", "todo.md")
  const deniedFile = join(externalDir, "notes", "todo.txt")
  mkdirSync(join(externalDir, "notes"), { recursive: true })
  writeFileSync(join(externalDir, "AGENTS.md"), "# AGENTS.md\n\n- glob 目录规则")
  writeFileSync(allowedFile, "glob grant")
  writeFileSync(deniedFile, "plain text")

  createElevatedPermissionGrant({
    workspaceRoot: root,
    access: "read",
    target: `${externalDir}/**/*.md`,
    actor: "admin",
  })

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const allowed = await registry.handlers.Read({
    path: allowedFile,
    __sessionId: "100-1",
  })
  assert.equal(allowed.isError, undefined)
  const allowedText = extractText(allowed as { content: Array<{ type: string; text?: string }> })
  assert.match(allowedText, /glob 目录规则/)
  assert.match(allowedText, /glob grant/)

  const denied = await registry.handlers.Read({
    path: deniedFile,
    __sessionId: "100-1",
  })
  assert.equal(denied.isError, true)
  assert.match(
    extractText(denied as { content: Array<{ type: string; text?: string }> }),
    /已创建授权请求/,
  )
})

test("Run resolves /workspace virtual paths inside shell commands", async () => {
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
    command: "cd /workspace/kimici && pwd && ls -la && sed -n '1,20p' README.md",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /STDOUT:/)
  assert.match(text, /kimici/)
  assert.match(text, /hello/)
  assert.doesNotMatch(text, /已创建授权请求/)
})

test("Write supports batch file creation in a single call", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")
  const sessionId = "100-1"

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
        path: "/workspace/project/a.md",
        content: "# A\n",
      },
      {
        path: "/workspace/project/b.md",
        content: "# B\n",
      },
    ],
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /批量写入完成（2 个文件）/)
  assert.match(text, /\/workspace\/project\/a\.md/)
  assert.match(text, /\/workspace\/project\/b\.md/)
  assert.equal(readFileSync(join(root, "project", "a.md"), "utf-8"), "# A\n")
  assert.equal(readFileSync(join(root, "project", "b.md"), "utf-8"), "# B\n")
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
        path: "/workspace/project/a.md",
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

test("Read can access workspace files through /workspace virtual path without reinjecting root AGENTS", async () => {
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
    path: "/workspace/memory/note.txt",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /bot 根目录规则/)
  assert.match(text, /from bot root/)
})

test("List includes nearest AGENTS.md when reading a directory", async () => {
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
    path: "/workspace/repo",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /\[AGENTS instructions from/)
  assert.match(text, /repo 目录规则/)
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
    path: "/workspace/repo/note.txt",
    __sessionId: "100-1",
  })
  const nestedText = extractText(nestedFile as { content: Array<{ type: string; text?: string }> })
  assert.match(nestedText, /\[AGENTS instructions from/)
  assert.match(nestedText, /repo 目录规则/)
  assert.match(nestedText, /nested note/)

  const agentsFile = await registry.handlers.Read({
    path: "/workspace/repo/AGENTS.md",
    __sessionId: "100-1",
  })
  const agentsText = extractText(agentsFile as { content: Array<{ type: string; text?: string }> })
  assert.equal(agentsText.match(/repo 目录规则/g)?.length, 1)
})

test("Read resolves /attachments from dedicated runtime attachments directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const runtimeAttachmentsDir = join(root, ".runtime", "attachments")
  const sessionsDir = join(root, "sessions")
  const attachmentDir = join(runtimeAttachmentsDir, "100-1")
  mkdirSync(attachmentDir, { recursive: true })
  writeFileSync(join(attachmentDir, "note.txt"), "attached note")

  const registry = createLocalTools({
    workspaceRoot: root,
    runtimeRoot: join(root, ".runtime"),
    skillSources: [],
    memoryDir: join(root, "memory"),
    sessionsDir,
    attachmentsDir: runtimeAttachmentsDir,
  })

  const result = await registry.handlers.Read({
    path: "/attachments/note.txt",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /attached note/)
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
    path: "/workspace/note.txt",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /父目录规则/)
  assert.match(text, /inside workspace/)
})

test("Read can access the inlined builtin planning-mode skill", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [getBuiltinSkillSource()],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const result = await registry.handlers.Read({
    path: "/skills/builtin/planning-mode/SKILL.md",
    __sessionId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.match(text, /复杂任务的主对话规划技能/)
  assert.match(text, /Task\.init/)
})

test("Task manages a conversation-scoped plan", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const sessionsDir = join(root, "sessions")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [getBuiltinSkillSource()],
    memoryDir: join(root, "memory"),
    sessionsDir,
  })

  const initResult = await registry.handlers.Task({
    __sessionId: "100-1",
    action: "init",
    goal: "处理复杂任务",
    tasks: [
      { title: "先读技能说明", skills: ["planning-mode"] },
      { title: "执行任务", blockedBy: ["1"] },
    ],
  })

  assert.equal(initResult.isError, undefined)
  const initText = extractText(initResult as { content: Array<{ type: string; text?: string }> })
  assert.match(initText, /任务计划已初始化/)
  assert.match(initText, /处理复杂任务/)
  assert.match(initText, /先读技能说明/)

  const listResult = await registry.handlers.Task({
    __sessionId: "100-1",
    action: "list",
  })
  assert.equal(listResult.isError, undefined)
  const listText = extractText(listResult as { content: Array<{ type: string; text?: string }> })
  assert.match(listText, /已获取 1 个任务。/)
  assert.match(listText, /先读技能说明/)
  assert.doesNotMatch(listText, /执行任务/)

  const getResult = await registry.handlers.Task({
    __sessionId: "100-1",
    action: "get",
  })
  const getText = extractText(getResult as { content: Array<{ type: string; text?: string }> })
  const ids = Array.from(getText.matchAll(/"id":\s*"([^"]+)"/g)).map((match) => match[1])
  const taskId = ids[1]
  assert.ok(taskId)

  const updateResult = await registry.handlers.Task({
    __sessionId: "100-1",
    action: "update",
    taskId,
    status: "done",
    summary: "已读完技能说明",
  })
  assert.equal(updateResult.isError, undefined)
  const updateText = extractText(updateResult as { content: Array<{ type: string; text?: string }> })
  assert.match(updateText, /任务状态已更新。/)
  assert.match(updateText, /已读完技能说明/)
})
