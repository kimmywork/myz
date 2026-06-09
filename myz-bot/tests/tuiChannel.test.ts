import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import {
  LOCAL_TUI_CHAT_ID,
  createTuiAwareChannelClient,
  startLocalTuiChannel,
} from "../src/tuiChannel"

test("channel-aware client synthesizes local TUI replies", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tui-channel-"))
  const config = createRuntimeConfig(root)
  const delegated: Array<{ chatId: number; text: string }> = []
  const client = createTuiAwareChannelClient({
    config,
    base: {
      getUpdates: async () => [],
      getMe: async () => ({ id: 1, username: "myzbot" }),
      getFile: async () => ({ fileId: "f1" }),
      downloadFile: async () => new ArrayBuffer(0),
      sendChatAction: async () => true,
      setMessageReaction: async () => true,
      sendMessage: async (chatId, text) => {
        delegated.push({ chatId, text })
        return []
      },
    },
  })

  const local = await client.sendMessage(LOCAL_TUI_CHAT_ID, "hello local")
  assert.equal(local.length, 1)
  assert.equal(local[0]?.chat.id, LOCAL_TUI_CHAT_ID)
  assert.equal(local[0]?.text, "hello local")
  assert.equal(local[0]?.from?.username, "myzbot")

  await client.sendMessage(123, "delegate me")
  assert.deepEqual(delegated, [{ chatId: 123, text: "delegate me" }])
})

test("local TUI channel turns keypresses into synthetic chat messages", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tui-channel-"))
  const config = createRuntimeConfig(root)
  const events = new EventEmitter() as EventEmitter & {
    isTTY: boolean
    rawModes: boolean[]
    setRawMode: (mode: boolean) => void
  }
  events.isTTY = true
  events.rawModes = []
  events.setRawMode = (mode: boolean) => {
    events.rawModes.push(mode)
  }

  const seen: string[] = []
  const monitorStates: Array<{ draft?: string; hint?: string; enabled?: boolean }> = []
  const controller = startLocalTuiChannel({
    config,
    input: events as any,
    monitor: {
      notePhase() {},
      noteIncomingMessage() {},
      noteOutgoingMessage() {},
      noteRequestStart() {
        return { startedAt: 0, requestId: "r1" }
      },
      noteRequestComplete() {},
      noteError() {},
      setInputState(state) {
        monitorStates.push(state)
      },
      getSnapshot() {
        throw new Error("not used")
      },
      close() {},
    },
    onMessage: async (message) => {
      seen.push(message.text || "")
    },
  })

  events.emit("keypress", "h", { name: "h" })
  events.emit("keypress", "i", { name: "i" })
  events.emit("keypress", "", { name: "return" })
  await controller.flush()

  assert.deepEqual(seen, ["hi"])
  assert.deepEqual(events.rawModes, [true])
  assert.equal(monitorStates.some((state) => state.draft === "hi"), true)

  controller.close()
  assert.deepEqual(events.rawModes, [true, false])
})
