import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseBotCommand,
  isSupportedBotCommandName,
  isPassthroughBotCommandName,
  formatSupportedBotCommands,
  matchCommand,
  SUPPORTED_BOT_COMMAND_NAMES,
} from "@myz/agent-core"

test("parseBotCommand parses slash commands", () => {
  assert.deepEqual(parseBotCommand("/help", "bot"), { name: "help", args: [] })
  assert.deepEqual(parseBotCommand("/model deepseek/deepseek-chat", "bot"), {
    name: "model",
    args: ["deepseek/deepseek-chat"],
  })
  assert.deepEqual(parseBotCommand("/agents build", "bot"), {
    name: "agents",
    args: ["build"],
  })
})

test("parseBotCommand strips @botname suffix", () => {
  assert.deepEqual(parseBotCommand("/help@mybot", "mybot"), {
    name: "help",
    args: [],
  })
})

test("parseBotCommand returns null for non-commands", () => {
  assert.equal(parseBotCommand("hello world", "bot"), null)
  assert.equal(parseBotCommand("", "bot"), null)
})

test("isSupportedBotCommandName only accepts known slash commands", () => {
  assert.equal(isSupportedBotCommandName("help"), true)
  assert.equal(isSupportedBotCommandName("clear"), true)
  assert.equal(isSupportedBotCommandName("agents"), true)
  assert.equal(isSupportedBotCommandName("model"), true)
  assert.equal(isSupportedBotCommandName("fork"), true)
  assert.equal(isSupportedBotCommandName("resume"), true)
  assert.equal(isSupportedBotCommandName("tools"), true)
  assert.equal(isSupportedBotCommandName("context"), true)
  assert.equal(isSupportedBotCommandName("compact"), true)
  assert.equal(isSupportedBotCommandName("todo"), false)
  assert.equal(isSupportedBotCommandName("ops"), false)
})

test("isPassthroughBotCommandName keeps reserved commands out of unknown-command interception", () => {
  assert.equal(isPassthroughBotCommandName("start"), true)
  assert.equal(isPassthroughBotCommandName("help"), false)
})

test("formatSupportedBotCommands returns the public command list", () => {
  const result = formatSupportedBotCommands()
  for (const name of SUPPORTED_BOT_COMMAND_NAMES) {
    assert.ok(result.includes(`/${name}`), `Expected /${name} in formatted commands`)
  }
})

test("matchCommand parses /command args", () => {
  assert.deepEqual(matchCommand("/help"), { command: "help", args: [] })
  assert.deepEqual(matchCommand("/model 1"), { command: "model", args: ["1"] })
  assert.deepEqual(matchCommand("/agents build"), { command: "agents", args: ["build"] })
  assert.equal(matchCommand("not a command"), null)
  assert.equal(matchCommand(""), null)
})
