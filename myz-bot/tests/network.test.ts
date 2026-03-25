import { test } from "node:test"
import assert from "node:assert/strict"
import { createFetchWithTimeout, shouldResetNetworkDispatcher } from "../src/network"

test("createFetchWithTimeout passes successful responses through", async () => {
  let callCount = 0
  const wrappedFetch = createFetchWithTimeout(
    async () => {
      callCount += 1
      return new Response("ok", { status: 200 })
    },
    {
      getRequestTimeoutMs: () => 1000,
    },
  )

  const response = await wrappedFetch("https://example.com")
  assert.equal(callCount, 1)
  assert.equal(await response.text(), "ok")
})

test("createFetchWithTimeout aborts hanging requests and reports network reset", async () => {
  let resetCount = 0
  const wrappedFetch = createFetchWithTimeout(
    async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(init.signal?.reason || new Error("aborted"))
          },
          { once: true },
        )
      }),
    {
      getRequestTimeoutMs: () => 20,
      onNetworkError: () => {
        resetCount += 1
      },
    },
  )

  await assert.rejects(() => wrappedFetch("https://example.com"), /Request timeout/)
  assert.equal(resetCount, 1)
})

test("shouldResetNetworkDispatcher detects undici-style network failures", () => {
  assert.equal(
    shouldResetNetworkDispatcher(new Error("fetch failed: connect ECONNRESET 127.0.0.1")),
    true,
  )
  assert.equal(
    shouldResetNetworkDispatcher(new Error("API request failed: 400 Bad Request")),
    false,
  )
})
