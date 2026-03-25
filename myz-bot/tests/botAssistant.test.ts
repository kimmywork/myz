import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBotAssistantAgent } from "../src/agents/botAssistant"

test("bot assistant prompt requires NO_REPLY in optional mode", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "optional",
    user: {},
  })

  assert.match(prompt, /NO_REPLY/)
})

test("bot assistant prompt disallows NO_REPLY in required mode", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /不允许输出 `NO_REPLY`/)
})

test("bot assistant prompt exposes session workspace as default workdir", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    sessionWorkspace: "/tmp/workspace/conversations/c1/workspace",
    user: {},
  })

  assert.match(prompt, /当前默认工作目录是 \/tmp\/workspace\/conversations\/c1\/workspace/)
  assert.match(prompt, /\/workspace/)
  assert.match(prompt, /\/bot/)
})

test("bot assistant prompt requires real memory writes for explicit remember requests", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /优先写入共享记忆/)
  assert.match(prompt, /不要声称自己已经记住/)
})

test("bot assistant prompt exposes relationship context and relay guardrails", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    relationshipContext: "当前关系记录：\n- 关系状态：私聊里较熟悉。\n- 主动联系边界：联系他人时需要谨慎。",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /关系与印象：/)
  assert.match(prompt, /私聊里较熟悉/)
  assert.match(prompt, /发送消息工具/)
})

test("bot assistant prompt exposes chat chronicle", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    chatChronicle: "# Chat Chronicle\n\n## 长期脉络\n- 用户最近在整理 bot 的长期记忆。",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /长期聊天编年：/)
  assert.match(prompt, /用户最近在整理 bot 的长期记忆/)
})

test("bot assistant prompt exposes recovered context", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    recoveredContext: "## 恢复上下文\n- 用户最近一直在整理长期记忆与关系层。",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /恢复上下文：/)
  assert.match(prompt, /长期记忆与关系层/)
})

test("bot assistant prompt loads workspace AGENTS.md by default", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  mkdirSync(join(root, "soul"), { recursive: true })
  writeFileSync(
    join(root, "AGENTS.md"),
    "# AGENTS.md\n\n## Rule\n- 回复前先确认工作区约定。",
  )
  writeFileSync(join(root, "SOUL.md"), "# Soul\n- 保持稳定。")
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    scope: "private",
    user: {},
  })

  assert.match(prompt, /工作区约定（AGENTS\.md）：/)
  assert.match(prompt, /回复前先确认工作区约定/)
})

test("bot assistant prompt tolerates missing workspace AGENTS.md", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  mkdirSync(join(root, "soul"), { recursive: true })
  writeFileSync(join(root, "SOUL.md"), "# Soul\n- 保持稳定。")
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.doesNotMatch(prompt, /工作区约定（AGENTS\.md）：/)
})

test("bot assistant prompt preloads root identity docs for private chats", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  mkdirSync(join(root, "soul"), { recursive: true })
  writeFileSync(join(root, "SOUL.md"), "# Soul\n- 保持稳定。")
  writeFileSync(join(root, "IDENTITY.md"), "# Identity\n- 名字：Akasa")
  writeFileSync(join(root, "USER.md"), "# User\n- 称呼：Stanley")
  writeFileSync(join(root, "BOOTSTRAP.md"), "# Bootstrap\n- 初次自我建立")
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    scope: "private",
    user: {},
  })

  assert.match(prompt, /根目录身份档案：/)
  assert.match(prompt, /### SOUL\.md/)
  assert.match(prompt, /### IDENTITY\.md/)
  assert.match(prompt, /### USER\.md/)
  assert.match(prompt, /### BOOTSTRAP\.md/)
  assert.match(prompt, /不要重复读取这些根目录身份文件/)
})

test("bot assistant prompt does not preload USER.md outside private scope", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  mkdirSync(join(root, "soul"), { recursive: true })
  writeFileSync(join(root, "SOUL.md"), "# Soul\n- 保持稳定。")
  writeFileSync(join(root, "USER.md"), "# User\n- 称呼：Stanley")
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildSystemPrompt({
    memoryContext: "",
    conversationSummary: "",
    replyMode: "required",
    scope: "group",
    user: {},
  })

  assert.match(prompt, /### SOUL\.md/)
  assert.doesNotMatch(prompt, /### USER\.md/)
})
