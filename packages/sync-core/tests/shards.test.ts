import { describe, expect, it } from "vitest"
import {
  buildShard,
  groupRecordsByShard,
  groupTombstonesByShard,
  openShard,
  preserveUnknownRecords,
  recordShardId,
  type PackedRecord,
  type RecordShardValue,
  type TombstoneShardValue,
} from "../src/shards"

const streamKey = new Uint8Array(32).fill(8)

function packed(recordId: string): PackedRecord {
  return {
    recordId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    recordHash: `hash-${recordId}`,
    recordCipher: "cipher",
    recordNonce: "nonce",
  }
}

describe("packed shards", () => {
  it("round-trips a records shard", async () => {
    const records = { "status:h:1": packed("status:h:1") }
    const body = await buildShard<RecordShardValue>(streamKey, "records", 3, {
      records,
    })
    const opened = await openShard<RecordShardValue>(
      streamKey,
      "records",
      3,
      body,
    )
    expect(opened).toEqual({ records })
  })

  it("round-trips a tombstone shard", async () => {
    const value: TombstoneShardValue = {
      tombstones: { "status:h:1": "2026-01-02T00:00:00.000Z" },
    }
    const body = await buildShard(streamKey, "tombstones", 5, value)
    expect(await openShard(streamKey, "tombstones", 5, body)).toEqual(value)
  })

  it("rejects a shard opened under a different kind or shard id", async () => {
    const body = await buildShard(streamKey, "records", 1, {
      records: {},
    } as RecordShardValue)
    await expect(
      openShard(streamKey, "tombstones", 1, body),
    ).rejects.toThrow()
    await expect(openShard(streamKey, "records", 2, body)).rejects.toThrow()
  })

  it("rejects a tampered shard", async () => {
    const body = await buildShard(streamKey, "records", 1, {
      records: {},
    } as RecordShardValue)
    const tampered = new Uint8Array(body)
    tampered[tampered.length - 1] ^= 0xff
    await expect(
      openShard(streamKey, "records", 1, tampered),
    ).rejects.toThrow()
  })

  it("groups records and tombstones by their consistent shard", () => {
    const ids = ["status:h:1", "status:h:2", "mark:h:1", "rel:h:1:h:2"]
    const groups = groupRecordsByShard(ids.map(packed), 64)
    let total = 0
    for (const [shardId, records] of groups) {
      for (const record of records) {
        expect(recordShardId(record.recordId, 64)).toBe(shardId)
        total += 1
      }
    }
    expect(total).toBe(ids.length)

    const tombstoneGroups = groupTombstonesByShard(
      { "status:h:1": "t1", "mark:h:1": "t2" },
      64,
    )
    expect(tombstoneGroups.size).toBeGreaterThan(0)
  })

  it("preserves unknown records opaquely", () => {
    const preserved = preserveUnknownRecords(
      { "status:h:1": { status: "kept" } },
      {
        "status:h:1": { status: "pending" },
        "future:h:2": { some: "unknown" },
      },
    )
    expect(preserved).toEqual({ "future:h:2": { some: "unknown" } })
  })
})
