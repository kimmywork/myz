import { describe, expect, it } from "vitest"
import type { StreamRemoteRecord } from "../src/streamClient"
import { mergeStreamRecords } from "../src/streamMerge"

function rec(
  recordId: string,
  updatedAt: string,
  recordHash: string,
): StreamRemoteRecord {
  return { recordId, updatedAt, recordHash, data: {} }
}

describe("stream LWW merge", () => {
  it("higher updatedAt wins and reports the remote winner", () => {
    const result = mergeStreamRecords({
      local: [rec("a", "2026-01-01T00:00:00.000Z", "l1")],
      remote: new Map([["a", rec("a", "2026-01-02T00:00:00.000Z", "r1")]]),
      tombstones: {},
    })
    expect(result.winners[0].recordHash).toBe("r1")
    expect(result.remoteWinners[0].recordHash).toBe("r1")
  })

  it("breaks an updatedAt tie with the higher recordHash", () => {
    const result = mergeStreamRecords({
      local: [rec("a", "2026-01-01T00:00:00.000Z", "zzz")],
      remote: new Map([["a", rec("a", "2026-01-01T00:00:00.000Z", "aaa")]]),
      tombstones: {},
    })
    expect(result.winners[0].recordHash).toBe("zzz")
    expect(result.remoteWinners).toHaveLength(0)
  })

  it("keeps local pending records that are absent remotely", () => {
    const result = mergeStreamRecords({
      local: [rec("a", "2026-01-01T00:00:00.000Z", "h")],
      remote: new Map(),
      tombstones: {},
    })
    expect(result.winners.map((winner) => winner.recordId)).toEqual(["a"])
    expect(result.remoteWinners).toHaveLength(0)
  })

  it("deletes a record when a newer tombstone exists", () => {
    const result = mergeStreamRecords({
      local: [rec("a", "2026-01-01T00:00:00.000Z", "h")],
      remote: new Map(),
      tombstones: { a: "2026-01-02T00:00:00.000Z" },
    })
    expect(result.deleted).toEqual(["a"])
    expect(result.winners).toHaveLength(0)
    expect(result.tombstones).toEqual({ a: "2026-01-02T00:00:00.000Z" })
  })

  it("drops a tombstone that is older than a re-created record", () => {
    const result = mergeStreamRecords({
      local: [rec("a", "2026-01-03T00:00:00.000Z", "h")],
      remote: new Map(),
      tombstones: { a: "2026-01-02T00:00:00.000Z" },
    })
    expect(result.deleted).toHaveLength(0)
    expect(result.tombstones).toEqual({})
  })

  it("keeps remote-only records", () => {
    const result = mergeStreamRecords({
      local: [],
      remote: new Map([["b", rec("b", "2026-01-01T00:00:00.000Z", "h")]]),
      tombstones: {},
    })
    expect(result.winners.map((winner) => winner.recordId)).toEqual(["b"])
    expect(result.remoteWinners).toHaveLength(1)
  })
})
