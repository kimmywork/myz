import { test } from "node:test"
import assert from "node:assert/strict"
import { formatErrorReply } from "../src/errors"
import type { BotRuntimeConfig } from "../src/config"
import { LOCAL_TUI_USER_ID } from "../src/tuiChannel"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createConfig(): BotRuntimeConfig {
  return createRuntimeConfig("/tmp/workspace")
}

test("formatErrorReply includes stack for TUI operator", () => {
  const config = createConfig()
  const error = new Error("boom")
  const reply = formatErrorReply({
    config,
    user: { id: LOCAL_TUI_USER_ID, username: "local" },
    error,
  })
  assert.match(reply, /boom/)
  assert.match(reply, /Error:/)
})

test("formatErrorReply hides stack for non-admins", () => {
  const config = createConfig()
  const reply = formatErrorReply({
    config,
    user: { id: 2, username: "user" },
    error: new Error("boom"),
  })
  assert.equal(reply, "处理失败，请稍后重试。")
})
