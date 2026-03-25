import { test } from "node:test"
import assert from "node:assert/strict"
import {
  countSoulDraftVisibleMessages,
  isSoulDraftVisibleMessage,
  shouldTriggerSoulAutoDraft,
} from "../src/soulDrafting"
import type { Message } from "@myz/ai-core/types"

function createMessage(overrides: Partial<Message>): Message {
  return {
    schemaVersion: "1.0.0",
    id: "msg-1",
    conversationId: "c1",
    role: "user",
    content: "hello",
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

test("isSoulDraftVisibleMessage excludes tool traces", () => {
  assert.equal(isSoulDraftVisibleMessage(createMessage({ role: "user" })), true)
  assert.equal(
    isSoulDraftVisibleMessage(createMessage({ role: "assistant", metadata: { type: "tool_audit" } })),
    false,
  )
  assert.equal(
    isSoulDraftVisibleMessage(
      createMessage({ role: "assistant", metadata: { type: "scheduled_task_reply" } }),
    ),
    false,
  )
  assert.equal(
    isSoulDraftVisibleMessage(
      createMessage({ role: "assistant", metadata: { type: "tool_progress" } }),
    ),
    false,
  )
  assert.equal(isSoulDraftVisibleMessage(createMessage({ role: "tool" })), false)
})

test("countSoulDraftVisibleMessages only counts user and final assistant messages", () => {
  const messages: Message[] = [
    createMessage({ role: "user", id: "1" }),
    createMessage({ role: "assistant", id: "2", content: "reply" }),
    createMessage({
      role: "assistant",
      id: "3",
      content: "",
      metadata: { type: "tool_audit" },
    }),
    createMessage({ role: "tool", id: "4", content: "result" }),
  ]
  assert.equal(countSoulDraftVisibleMessages(messages), 2)
})

test("shouldTriggerSoulAutoDraft is stable even when tool calls are present", () => {
  const messages: Message[] = [
    createMessage({ role: "user", id: "1" }),
    createMessage({ role: "assistant", id: "2", content: "a" }),
    createMessage({ role: "user", id: "3" }),
    createMessage({ role: "assistant", id: "4", content: "" }),
    createMessage({
      role: "assistant",
      id: "5",
      content: "",
      metadata: { type: "tool_audit" },
    }),
    createMessage({ role: "tool", id: "6", content: "x" }),
    createMessage({ role: "assistant", id: "7", content: "b" }),
  ]
  assert.equal(shouldTriggerSoulAutoDraft(messages, 6), false)
  assert.equal(shouldTriggerSoulAutoDraft(messages, 4), false)
  assert.equal(shouldTriggerSoulAutoDraft(messages, 5), true)
})
