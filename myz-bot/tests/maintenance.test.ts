import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BotRuntimeConfig } from "../src/config"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import { ensureConversationDir } from "../src/conversations"
import {
  __resetRestartStateForTest,
  __setRestartExitHandlerForTest,
  collectTokenUsageSummary,
  formatTokenUsageSummary,
  getBotRuntimeStatus,
  requestProcessRestart,
} from "../src/maintenance"
import { createElevatedPermissionRequest } from "../src/elevatedPermissions"
import { createScheduledTask } from "../src/tasks"

function createConfig(root: string): BotRuntimeConfig {
  return createRuntimeConfig(root, {
    channels: {
      telegram: {
        adminUsers: ["admin"],
      },
    },
  })
}

function writeJsonl(path: string, entries: unknown[]) {
  writeFileSync(
    path,
    entries.length ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
  )
}

test("collectTokenUsageSummary aggregates live llm usage", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  const c1Dir = ensureConversationDir(config.conversationsDir, "c1")
  const c2Dir = ensureConversationDir(config.conversationsDir, "c2")

  writeJsonl(join(c1Dir, "llm-history.jsonl"), [
    {
      id: "m1",
      conversationId: "c1",
      role: "assistant",
      content: "reply 1",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 1,
        providerPreviousResponseId: "resp-prev",
        usage: {
          total_tokens: 10,
          prompt_tokens: 6,
          completion_tokens: 4,
        },
      },
    },
  ])
  writeJsonl(join(c2Dir, "llm-history.jsonl"), [
    {
      id: "m3",
      conversationId: "c2",
      role: "assistant",
      content: "reply 3",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 0,
        usage: {
          total_tokens: 5,
          prompt_tokens: 3,
          completion_tokens: 2,
        },
      },
    },
  ])

  const current = collectTokenUsageSummary({
    config,
    scope: "current",
    conversationId: "c1",
  })
  assert.equal(current.totalTokens, 10)
  assert.equal(current.promptTokens, 6)
  assert.equal(current.completionTokens, 4)
  assert.equal(current.reasoningTokens, 0)
  assert.equal(current.cachedPromptTokens, 0)
  assert.equal(current.toolCallCount, 1)
  assert.equal(current.resumedReplies, 1)
  assert.equal(current.cacheHitReplies, 0)
  assert.equal(current.byConversation.length, 1)

  const all = collectTokenUsageSummary({
    config,
    scope: "all",
  })
  assert.equal(all.totalTokens, 15)
  assert.equal(all.cachedPromptTokens, 0)
  assert.equal(all.resumedReplies, 1)
  assert.equal(all.cacheHitReplies, 0)
  assert.equal(all.byConversation[0]?.conversationId, "c1")
  assert.equal(all.byConversation[1]?.conversationId, "c2")
})

test("collectTokenUsageSummary understands responses-style input/output token fields", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  const c1Dir = ensureConversationDir(config.conversationsDir, "c1")

  writeJsonl(join(c1Dir, "llm-history.jsonl"), [
    {
      id: "m1",
      conversationId: "c1",
      role: "assistant",
      content: "reply 1",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 0,
        providerPreviousResponseId: "resp-prev",
        usage: {
          total_tokens: 90,
          input_tokens: 60,
          output_tokens: 30,
          input_tokens_details: {
            cached_tokens: 40,
          },
          output_tokens_details: {
            reasoning_tokens: 12,
          },
        },
      },
    },
  ])

  const summary = collectTokenUsageSummary({
    config,
    scope: "current",
    conversationId: "c1",
  })

  assert.equal(summary.totalTokens, 90)
  assert.equal(summary.promptTokens, 60)
  assert.equal(summary.cachedPromptTokens, 40)
  assert.equal(summary.completionTokens, 30)
  assert.equal(summary.reasoningTokens, 12)
  assert.equal(summary.resumedReplies, 1)
  assert.equal(summary.cacheHitReplies, 1)
  assert.match(formatTokenUsageSummary(summary), /resumedReplies: 1/)
  assert.match(formatTokenUsageSummary(summary), /cacheHitReplies: 1/)
  assert.match(formatTokenUsageSummary(summary), /cachedPromptTokens: 40/)
  assert.match(formatTokenUsageSummary(summary), /cached=40/)
  assert.match(formatTokenUsageSummary(summary), /resumed=1/)
  assert.match(formatTokenUsageSummary(summary), /cacheHits=1/)
})

test("getBotRuntimeStatus reports conversations, permissions, and active tasks", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  createElevatedPermissionRequest({
    workspaceRoot: config.workspaceRuntimeRoot,
    access: "read",
    targetPath: join(root, "secret.txt"),
    rawTarget: join(root, "secret.txt"),
    toolName: "Read",
    reason: "test",
    conversationId: "c1",
  })
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  createScheduledTask({
    conversationDir,
    conversationId: "c1",
    title: "Pending",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
  })

  const status = getBotRuntimeStatus(config)
  assert.equal(status.conversations, 1)
  assert.equal(status.pendingPermissionRequests, 1)
  assert.equal(status.activeTasks, 1)
  assert.equal(status.schedulerEnabled, true)
})

test("requestProcessRestart schedules a single exit request", async () => {
  const exitCodes: number[] = []
  const root = mkdtempSync(join(tmpdir(), "myz-bot-restart-"))
  const requestFilePath = join(root, "system", "restart-request.json")
  __resetRestartStateForTest()
  __setRestartExitHandlerForTest((exitCode) => {
    exitCodes.push(exitCode)
  })

  assert.equal(
    requestProcessRestart({
      delayMs: 0,
      exitCode: 91,
      requestFilePath,
      reason: "ops_restart",
      requestedBy: "admin",
    }),
    true,
  )
  assert.equal(requestProcessRestart({ delayMs: 0, exitCode: 92 }), false)

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))

  assert.deepEqual(exitCodes, [91])
  assert.equal(existsSync(requestFilePath), true)
  const request = JSON.parse(readFileSync(requestFilePath, "utf-8")) as {
    reason?: string
    requestedBy?: string
    exitCode?: number
  }
  assert.equal(request.reason, "ops_restart")
  assert.equal(request.requestedBy, "admin")
  assert.equal(request.exitCode, 91)
  __setRestartExitHandlerForTest(null)
})
