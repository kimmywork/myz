import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProviderMessage } from "@myz/ai-core/providers/types"
import type { ChatMessage, ChatSendMessageOptions } from "../src/chatChannel"
import { ensureSessionDir } from "../src/sessions"
import {
  createToolProgressNotifier,
  draftToolProgressMessage,
} from "../src/toolProgress"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createTestConfig(root: string) {
  return createRuntimeConfig(root)
}

test("draftToolProgressMessage prefers assistant-authored draft content", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const text = await draftToolProgressMessage({
    config: createTestConfig(root),
    sessionId: "c1",
    soul: "# Bot\n自然、简洁。",
    latestUserInput: "帮我看一下 README",
    phase: "start",
    assistantDraft: ' <thought>ignore</thought> "我先看一下这份 README。" ',
    toolNames: ["Read"],
    toolArgsSummary: "path=/workspace/README.md",
  })

  assert.equal(text, "我先看一下这份 README。")
})

test("draftToolProgressMessage collapses duplicated assistant-authored progress text", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const text = await draftToolProgressMessage({
    config: createTestConfig(root),
    sessionId: "c1",
    soul: "# Bot\n自然、简洁。",
    latestUserInput: "帮我看一下 README",
    phase: "start",
    assistantDraft: [
      "我先把这边的引导要求看清了：这轮确实该把角色档案补得更鲜明一点。",
      "我先把这边的引导要求看清了：这轮确实该把角色档案补得更鲜明一点。",
    ].join("\n"),
    toolNames: ["Read"],
    toolArgsSummary: "path=/workspace/README.md",
  })

  assert.equal(text, "我先把这边的引导要求看清了：这轮确实该把角色档案补得更鲜明一点。")
})

test("draftToolProgressMessage falls back to natural phrasing when helper drafting fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const config = createTestConfig(root)
  const text = await draftToolProgressMessage({
    config: {
      ...config,
      ai: {
        ...config.ai,
        baseUrl: "http://127.0.0.1:1",
        retry: {
          retries: 0,
          baseDelayMs: 0,
        },
      },
    },
    sessionId: "c1",
    soul: "# Bot\n自然、简洁。",
    latestUserInput: "帮我看一下 README",
    phase: "result",
    toolNames: ["Read"],
    resultSummary: "README content preview",
  })

  assert.match(text, /README content preview/)
  assert.doesNotMatch(text, /工具完成|调用工具|参数/)
})

test("createToolProgressNotifier sends natural progress messages", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const sessionDir = ensureSessionDir(join(root, "conversations"), "c1")
  const sent: string[] = []
  let messageId = 200

  const notifier = createToolProgressNotifier({
    config: createTestConfig(root),
    channel: {
      sendMessage: async (
        _chatId: number,
        text: string,
        _options?: ChatSendMessageOptions,
      ) => {
        sent.push(text)
        messageId += 1
        return [
          {
            messageId,
            unixTime: Math.floor(Date.now() / 1000),
            text,
            chat: { id: 101, type: "private" },
            from: { id: 999, username: "testbot" },
          } satisfies ChatMessage,
        ]
      },
    } as any,
    sessionDir,
    sessionId: "c1",
    chatId: 101,
    latestUserInput: "帮我看一下 README",
    soul: "# Bot\n自然、简洁。",
    draftMessage: async (options) =>
      options.phase === "start"
        ? "我先看一下这份 README。"
        : "我已经看到里面的关键内容了，接着给你收一下。",
  })

  const toolCallMessage: ProviderMessage = {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "Read",
          arguments: JSON.stringify({ path: "/workspace/README.md" }),
        },
      },
    ],
  }
  const toolResultMessage: ProviderMessage = {
    role: "tool",
    tool_call_id: "call-1",
    content: "README content preview",
    metadata: {
      toolName: "Read",
    },
  }

  notifier.onToolCallMessage(toolCallMessage)
  notifier.onToolResultMessage(toolResultMessage)
  await notifier.flush()

  assert.equal(sent.length, 2)
  assert.equal(sent[0], "我先看一下这份 README。")
  assert.equal(sent[1], "我已经看到里面的关键内容了，接着给你收一下。")
})

test("createToolProgressNotifier skips internal SelectTools activity", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const sessionDir = ensureSessionDir(join(root, "conversations"), "c1")
  let sent = 0

  const notifier = createToolProgressNotifier({
    config: createTestConfig(root),
    channel: {
      sendMessage: async () => {
        sent += 1
        return []
      },
    } as any,
    sessionDir,
    sessionId: "c1",
    chatId: 101,
    latestUserInput: "帮我查一下",
    soul: "# Bot\n自然、简洁。",
    draftMessage: async () => "placeholder",
  })

  notifier.onToolCallMessage({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "SelectTools",
          arguments: "{}",
        },
      },
    ],
  })
  notifier.onToolResultMessage({
    role: "tool",
    tool_call_id: "call-1",
    content: '{"tool_names":["Read"]}',
    metadata: { toolName: "SelectTools" },
  })
  await notifier.flush()

  assert.equal(sent, 0)
})

test("createToolProgressNotifier batches a multi-tool round into one start and one result message", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-progress-"))
  const sessionDir = ensureSessionDir(join(root, "conversations"), "c1")
  const sent: string[] = []
  let messageId = 300

  const notifier = createToolProgressNotifier({
    config: createTestConfig(root),
    channel: {
      sendMessage: async (
        _chatId: number,
        text: string,
        _options?: ChatSendMessageOptions,
      ) => {
        sent.push(text)
        messageId += 1
        return [
          {
            messageId,
            unixTime: Math.floor(Date.now() / 1000),
            text,
            chat: { id: 101, type: "private" },
            from: { id: 999, username: "testbot" },
          } satisfies ChatMessage,
        ]
      },
    } as any,
    sessionDir,
    sessionId: "c1",
    chatId: 101,
    latestUserInput: "帮我看看这两个文件",
    soul: "# Bot\n自然、简洁。",
    draftMessage: async (options) =>
      options.phase === "start"
        ? `start:${options.toolNames.join(",")}`
        : `result:${options.toolNames.join(",")}:${options.resultSummary || ""}`,
  })

  notifier.onToolCallMessage({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "Read",
          arguments: JSON.stringify({ path: "/workspace/README.md" }),
        },
      },
      {
        id: "call-2",
        type: "function",
        function: {
          name: "List",
          arguments: JSON.stringify({ path: "/workspace/src" }),
        },
      },
    ],
  })
  notifier.onToolResultMessage({
    role: "tool",
    tool_call_id: "call-1",
    content: "README ready",
    metadata: {
      toolName: "Read",
    },
  })
  notifier.onToolResultMessage({
    role: "tool",
    tool_call_id: "call-2",
    content: "src entries ready",
    metadata: {
      toolName: "List",
    },
  })
  await notifier.flush()

  assert.deepEqual(sent, [
    "start:Read,List",
    "result:Read,List:README ready | src entries ready",
  ])
})
