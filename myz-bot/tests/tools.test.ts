import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureConversationDir,
  getLlmHistoryPath,
  saveMetadata,
} from "../src/conversations"
import {
  approveElevatedPermissionRequest,
  createElevatedPermissionGrant,
  listElevatedPermissionRequests,
  revokeElevatedPermissionGrant,
} from "../src/elevatedPermissions"
import { touchRelationshipRecord } from "../src/relationships"
import { createLocalTools } from "../src/tools"

function extractText(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .map((item) => (item.type === "text" ? item.text || "" : ""))
    .join("\n")
}

test("SendMessageToContact relays to a known private contact and records target history", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
  const sourceDir = ensureConversationDir(conversationsDir, "100-1")
  const targetDir = ensureConversationDir(conversationsDir, "200-2")

  saveMetadata(sourceDir, {
    schemaVersion: "1.0.0",
    conversationId: "100-1",
    chatId: 100,
    userId: 1,
    scope: "private",
    chatType: "private",
    username: "alice",
    firstName: "Alice",
    lastName: "",
    lastActorDisplayName: "Alice (@alice)",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  saveMetadata(targetDir, {
    schemaVersion: "1.0.0",
    conversationId: "200-2",
    chatId: 200,
    userId: 2,
    scope: "private",
    chatType: "private",
    username: "bob",
    firstName: "Bob",
    lastName: "",
    lastActorDisplayName: "Bob (@bob)",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  touchRelationshipRecord({
    workspaceRoot: root,
    conversationId: "200-2",
    scope: "private",
    chatId: 200,
    actorUserId: 2,
    username: "bob",
    firstName: "Bob",
    displayName: "Bob (@bob)",
  })

  const sent: Array<{ chatId: number; text: string }> = []
  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
    telegram: {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text })
        return []
      },
    },
  })

  const result = await registry.handlers.SendMessageToContact({
    __conversationId: "100-1",
    target: "bob",
    message: [
      "[转告自 Alice (@alice)]",
      "原因：Alice 请我提醒你。",
      "代 Alice 转告你一句：请记得今晚看一下日报。",
    ].join("\n"),
    reason: "Alice 请我提醒你。",
  })

  assert.equal(result.isError, undefined)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.chatId, 200)
  assert.equal(sent[0]?.text, "代 Alice 转告你一句：请记得今晚看一下日报。")

  const historyFile = getLlmHistoryPath(targetDir)
  assert.equal(existsSync(historyFile), true)
  const history = readFileSync(historyFile, "utf-8")
  assert.match(history, /outbound_relay/)
  assert.match(history, /deliveredMessage/)
})

test("external path access creates permission request, notifies admin, and works after approval", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
  const adminDir = ensureConversationDir(conversationsDir, "300-3")
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-external-"))
  const externalFile = join(externalDir, "note.txt")
  writeFileSync(join(externalDir, "AGENTS.md"), "# AGENTS.md\n\n- 外部目录规则")
  writeFileSync(externalFile, "outside workspace")

  saveMetadata(adminDir, {
    schemaVersion: "1.0.0",
    conversationId: "300-3",
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
    conversationsDir,
    adminUsers: ["admin"],
    telegram: {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text })
        return []
      },
    },
  })

  const first = await registry.handlers.Read({
    path: externalFile,
    __conversationId: "300-3",
  })

  assert.equal(first.isError, true)
  const firstText = extractText(first as { content: Array<{ type: string; text?: string }> })
  assert.match(firstText, /已创建授权请求/)
  const requests = listElevatedPermissionRequests(root, "pending")
  assert.equal(requests.length, 1)
  assert.equal(sent.length, 1)
  assert.match(sent[0]?.text || "", /approve: \/permit approve/)

  approveElevatedPermissionRequest({
    workspaceRoot: root,
    requestId: requests[0]!.id,
    actor: "admin",
  })

  const second = await registry.handlers.Read({
    path: externalFile,
    __conversationId: "300-3",
  })

  assert.equal(second.isError, undefined)
  const secondText = extractText(second as { content: Array<{ type: string; text?: string }> })
  assert.match(secondText, /\[AGENTS instructions from/)
  assert.match(secondText, /外部目录规则/)
  assert.match(secondText, /outside workspace/)
})

test("manual prefix grant allows subtree access and revoke removes it", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
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
    conversationsDir,
  })

  const allowed = await registry.handlers.Read({
    path: externalFile,
    __conversationId: "100-1",
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
    __conversationId: "100-1",
  })
  assert.equal(denied.isError, true)
  assert.match(
    extractText(denied as { content: Array<{ type: string; text?: string }> }),
    /已创建授权请求/,
  )
})

test("manual glob grant allows matching files without opening the whole directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
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
    conversationsDir,
  })

  const allowed = await registry.handlers.Read({
    path: allowedFile,
    __conversationId: "100-1",
  })
  assert.equal(allowed.isError, undefined)
  const allowedText = extractText(allowed as { content: Array<{ type: string; text?: string }> })
  assert.match(allowedText, /glob 目录规则/)
  assert.match(allowedText, /glob grant/)

  const denied = await registry.handlers.Read({
    path: deniedFile,
    __conversationId: "100-1",
  })
  assert.equal(denied.isError, true)
  assert.match(
    extractText(denied as { content: Array<{ type: string; text?: string }> }),
    /已创建授权请求/,
  )
})

test("Run resolves /workspace virtual paths inside shell commands", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
  const conversationId = "100-1"
  const repoDir = join(root, "kimici")
  mkdirSync(repoDir, { recursive: true })
  writeFileSync(join(repoDir, "README.md"), "hello")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const result = await registry.handlers.Run({
    __conversationId: conversationId,
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
  const conversationsDir = join(root, "conversations")
  const conversationId = "100-1"

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const result = await registry.handlers.Write({
    __conversationId: conversationId,
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
  const conversationsDir = join(root, "conversations")
  const conversationId = "100-1"
  const externalDir = mkdtempSync(join(tmpdir(), "myz-bot-write-batch-"))
  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const result = await registry.handlers.Write({
    __conversationId: conversationId,
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
  const conversationsDir = join(root, "conversations")
  const memoryDir = join(root, "memory")
  mkdirSync(memoryDir, { recursive: true })
  writeFileSync(join(memoryDir, "note.txt"), "from bot root")
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS.md\n\n- bot 根目录规则")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir,
    conversationsDir,
  })

  const result = await registry.handlers.Read({
    path: "/workspace/memory/note.txt",
    __conversationId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /bot 根目录规则/)
  assert.match(text, /from bot root/)
})

test("List includes nearest AGENTS.md when reading a directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tools-"))
  const conversationsDir = join(root, "conversations")
  const projectDir = join(root, "repo")
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, "AGENTS.md"), "# AGENTS.md\n\n- repo 目录规则")
  writeFileSync(join(projectDir, "a.txt"), "a")
  writeFileSync(join(projectDir, "b.txt"), "b")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const result = await registry.handlers.List({
    path: "/workspace/repo",
    __conversationId: "100-1",
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
  const conversationsDir = join(root, "conversations")
  const projectDir = join(root, "repo")
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, "AGENTS.md"), "# AGENTS.md\n\n- repo 目录规则")
  writeFileSync(join(projectDir, "note.txt"), "nested note")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const nestedFile = await registry.handlers.Read({
    path: "/workspace/repo/note.txt",
    __conversationId: "100-1",
  })
  const nestedText = extractText(nestedFile as { content: Array<{ type: string; text?: string }> })
  assert.match(nestedText, /\[AGENTS instructions from/)
  assert.match(nestedText, /repo 目录规则/)
  assert.match(nestedText, /nested note/)

  const agentsFile = await registry.handlers.Read({
    path: "/workspace/repo/AGENTS.md",
    __conversationId: "100-1",
  })
  const agentsText = extractText(agentsFile as { content: Array<{ type: string; text?: string }> })
  assert.equal(agentsText.match(/repo 目录规则/g)?.length, 1)
})

test("Read does not inject parent AGENTS outside workspace root", async () => {
  const parent = mkdtempSync(join(tmpdir(), "myz-bot-tools-parent-"))
  const root = join(parent, "workspace")
  mkdirSync(root, { recursive: true })
  const conversationsDir = join(root, "conversations")
  writeFileSync(join(parent, "AGENTS.md"), "# AGENTS.md\n\n- 父目录规则")
  writeFileSync(join(root, "note.txt"), "inside workspace")

  const registry = createLocalTools({
    workspaceRoot: root,
    skillSources: [],
    memoryDir: join(root, "memory"),
    conversationsDir,
  })

  const result = await registry.handlers.Read({
    path: "/workspace/note.txt",
    __conversationId: "100-1",
  })

  assert.equal(result.isError, undefined)
  const text = extractText(result as { content: Array<{ type: string; text?: string }> })
  assert.doesNotMatch(text, /\[AGENTS instructions from/)
  assert.doesNotMatch(text, /父目录规则/)
  assert.match(text, /inside workspace/)
})
