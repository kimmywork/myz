import { describe, expect, it } from "vitest"
import {
  readStreamMeta,
  streamMetaPath,
  writeStreamMeta,
} from "../src/stream/stream-records"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const ACCOUNT = "acct_stream"
const STREAM = "highlights"

function storeWithRawMeta(raw: string): InMemoryObjectStore {
  const store = new InMemoryObjectStore()
  // Write the raw bytes directly so we control the (untrusted) payload.
  void store.putObject(streamMetaPath(ACCOUNT, STREAM), new TextEncoder().encode(raw))
  return store
}

describe("readStreamMeta tolerance", () => {
  it("reads a well-formed meta", async () => {
    const store = new InMemoryObjectStore()
    await writeStreamMeta(store, ACCOUNT, STREAM, {
      streamVersion: 3,
      manifestVersion: 2,
    })
    await expect(readStreamMeta(store, ACCOUNT, STREAM)).resolves.toMatchObject({
      streamVersion: 3,
      manifestVersion: 2,
    })
  })

  it("returns null instead of throwing on malformed JSON", async () => {
    const store = storeWithRawMeta("{ not json")
    await expect(readStreamMeta(store, ACCOUNT, STREAM)).resolves.toBeNull()
  })

  it("returns null on a shape-invalid meta", async () => {
    const store = storeWithRawMeta(JSON.stringify({ streamVersion: "x" }))
    await expect(readStreamMeta(store, ACCOUNT, STREAM)).resolves.toBeNull()
  })

  it("returns null when the meta object is absent", async () => {
    const store = new InMemoryObjectStore()
    await expect(readStreamMeta(store, ACCOUNT, STREAM)).resolves.toBeNull()
  })
})
