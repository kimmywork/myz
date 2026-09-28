import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning"
import { describe, expect, it } from "vitest"
import { buildChunkForRecord } from "../src/chunks"
import { packNoncePayload, sha256, utf8ToBytes } from "../src/crypto"
import { fetchRemoteRecords } from "../src/remote"
import type {
  ManifestChainHead,
  ManifestChunkEntry,
  ManifestRecordEntry,
  SyncRecord,
} from "../src/types"
import { bytesToBase64, bytesToHex, stableStringify } from "../src/utils"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const masterKey = new Uint8Array(32).fill(3)
const keyId = "account"

async function buildFixture() {
  const record = {
    recordId: "h:1",
    type: "highlight",
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: { id: "1" } as never,
    recordHash: "",
  } as SyncRecord
  const payload = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    recordId: record.recordId,
    type: record.type,
    updatedAt: record.updatedAt,
    data: record.data,
  }
  record.recordHash = bytesToHex(
    await sha256(utf8ToBytes(stableStringify(payload))),
  )
  const built = await buildChunkForRecord(record, masterKey, "")
  const body = packNoncePayload(built.chunkNonce, built.chunkCipher)
  const store = new InMemoryObjectStore()
  await store.putObject(`${keyId}/chunks/${built.chunkId}.bin`, body)
  const chunksIndex: Record<string, ManifestChunkEntry> = {
    [built.chunkId]: {
      hash: bytesToHex(await sha256(body)),
      size: body.length,
      nonce: bytesToBase64(built.chunkNonce),
    },
  }
  const records = new Map<string, ManifestRecordEntry>([
    [
      record.recordId,
      {
        chunkId: built.chunkId,
        updatedAt: record.updatedAt,
        recordHash: record.recordHash,
      },
    ],
  ])
  const chainHeads: Record<string, ManifestChainHead> = {
    [record.recordId]: {
      keyId: built.keyId,
      recordHash: record.recordHash,
      updatedAt: record.updatedAt,
    },
  }
  return { store, records, chunksIndex, chainHeads, built, body }
}

describe("remote integrity verification", () => {
  it("fetches and verifies a well-formed remote record", async () => {
    const f = await buildFixture()
    const payloads = await fetchRemoteRecords(
      f.store,
      masterKey,
      keyId,
      f.records,
      f.chunksIndex,
      f.chainHeads,
    )
    expect(payloads).toHaveLength(1)
    expect(payloads[0].recordId).toBe("h:1")
  })

  it("rejects a tampered chunk", async () => {
    const f = await buildFixture()
    const tampered = new Uint8Array(f.body)
    tampered[tampered.length - 1] ^= 0xff
    await f.store.putObject(`${keyId}/chunks/${f.built.chunkId}.bin`, tampered)
    await expect(
      fetchRemoteRecords(
        f.store,
        masterKey,
        keyId,
        f.records,
        f.chunksIndex,
        f.chainHeads,
      ),
    ).rejects.toThrow(/integrity/i)
  })

  it("rejects a record whose hash does not match the manifest index", async () => {
    const f = await buildFixture()
    const badRecords = new Map(f.records)
    badRecords.set("h:1", { ...f.records.get("h:1")!, recordHash: "deadbeef" })
    await expect(
      fetchRemoteRecords(
        f.store,
        masterKey,
        keyId,
        badRecords,
        f.chunksIndex,
        f.chainHeads,
      ),
    ).rejects.toThrow(/Record hash mismatch/i)
  })

  it("rejects a manifest chain head that disagrees with the record index", async () => {
    const f = await buildFixture()
    const badHeads: Record<string, ManifestChainHead> = {
      "h:1": { ...f.chainHeads["h:1"], recordHash: "nope" },
    }
    await expect(
      fetchRemoteRecords(
        f.store,
        masterKey,
        keyId,
        f.records,
        f.chunksIndex,
        badHeads,
      ),
    ).rejects.toThrow(/chain head/i)
  })
})
