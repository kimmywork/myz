import { test } from "node:test"
import assert from "node:assert/strict"
import type { ProviderMessage } from "@myz/ai-core/providers/types"
import { mapSystemMessagesToUserMessages } from "../src/ai"

test("mapSystemMessagesToUserMessages keeps messages unchanged when disabled", () => {
  const messages: ProviderMessage[] = [
    { role: "system", content: "SOUL" },
    { role: "user", content: "hello" },
  ]

  const result = mapSystemMessagesToUserMessages(messages, false)
  assert.deepEqual(result, messages)
})

test("mapSystemMessagesToUserMessages rewrites system messages as user messages", () => {
  const messages: ProviderMessage[] = [
    { role: "system", content: "SOUL content" },
    { role: "developer", content: "Extra instruction" },
    { role: "user", content: "hello" },
  ]

  const result = mapSystemMessagesToUserMessages(messages, true)
  assert.equal(result[0]?.role, "user")
  assert.equal(result[1]?.role, "user")
  assert.match(String(result[0]?.content || ""), /\[System Instruction\]/)
  assert.match(String(result[0]?.content || ""), /SOUL content/)
  assert.equal(result[2]?.role, "user")
  assert.equal(result[2]?.content, "hello")
})
