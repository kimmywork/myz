import { test } from "node:test"
import assert from "node:assert/strict"
import {
  formatSupportedBotCommands,
  isPassthroughBotCommandName,
  isSupportedBotCommandName,
  parseBotCommand,
} from "../src/commands"

test("parseBotCommand normalizes bot mentions", () => {
  assert.deepEqual(parseBotCommand("/todo@testbot list", "testbot"), {
    name: "todo",
    args: ["list"],
  })
})

test("parseBotCommand preserves /skills/<source>/<name> shorthand", () => {
  assert.deepEqual(parseBotCommand("/skills/local/demo", "testbot"), {
    name: "skills",
    args: ["local/demo"],
  })
})

test("isSupportedBotCommandName only accepts known slash commands", () => {
  assert.equal(isSupportedBotCommandName("todo"), true)
  assert.equal(isSupportedBotCommandName("ops"), true)
  assert.equal(isSupportedBotCommandName("tasks"), false)
})

test("isPassthroughBotCommandName keeps reserved commands out of unknown-command interception", () => {
  assert.equal(isPassthroughBotCommandName("start"), true)
  assert.equal(isPassthroughBotCommandName("tasks"), false)
})

test("formatSupportedBotCommands returns the public command list", () => {
  assert.equal(formatSupportedBotCommands(), "/skills、/todo、/soul、/permit、/ops")
})
