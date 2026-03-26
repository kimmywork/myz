import { test } from "node:test"
import assert from "node:assert/strict"
import { createTelegramClient } from "../src/telegram"

test("createTelegramClient sends sendChatAction and setMessageReaction payloads", async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    })
    return {
      ok: true,
      json: async () => ({ ok: true }),
      text: async () => "",
    } as Response
  }) as typeof fetch

  try {
    const client = createTelegramClient({
      token: "test-token",
      retry: {
        retries: 0,
        baseDelayMs: 0,
      },
    })

    await client.sendChatAction(42, "typing", {
      messageThreadId: 7,
    })
    await client.setMessageReaction(42, 1001, "👌", {
      isBig: true,
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(
    requests[0]?.url,
    "https://api.telegram.org/bottest-token/sendChatAction",
  )
  assert.deepEqual(requests[0]?.body, {
    chat_id: 42,
    action: "typing",
    message_thread_id: 7,
  })
  assert.equal(
    requests[1]?.url,
    "https://api.telegram.org/bottest-token/setMessageReaction",
  )
  assert.deepEqual(requests[1]?.body, {
    chat_id: 42,
    message_id: 1001,
    reaction: [{ type: "emoji", emoji: "👌" }],
    is_big: true,
  })
})
