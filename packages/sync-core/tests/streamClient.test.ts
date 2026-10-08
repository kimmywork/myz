import { describe, expect, it } from "vitest"
import {
  deriveMasterKeyFromDataKey,
  deriveStreamMasterKey,
  generateDataKey,
} from "../src/dataKey"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"
import { addDeviceToRoster, createGenesisRoster } from "../src/roster"
import {
  buildStreamPush,
  commitStreamPush,
  pullStream,
  streamShardPath,
  syncStream,
  type StreamRecordInput,
} from "../src/streamClient"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const ACCOUNT = "acct_stream"
const STREAM = "inbox"

async function setup() {
  const device = generateDeviceKeyPair()
  const dataKey = generateDataKey()
  const roster = await createGenesisRoster({
    accountId: ACCOUNT,
    device,
    dataKey,
  })
  const masterKey = await deriveMasterKeyFromDataKey(dataKey)
  const streamKey = await deriveStreamMasterKey(masterKey, STREAM)
  const deviceId = await deviceIdFromSignPublicKey(device.signPublicKey)
  return { device, deviceId, roster, streamKey, store: new InMemoryObjectStore(), dataKey }
}

function record(
  recordId: string,
  updatedAt: string,
  data: unknown,
): StreamRecordInput {
  return { recordId, updatedAt, data }
}

describe("v2 stream client", () => {
  it("pushes and pulls sharded records end to end", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    const records = [
      record("status:h:1", "2026-01-01T00:00:00.000Z", { status: "pending" }),
      record("status:h:2", "2026-01-01T00:01:00.000Z", { status: "kept" }),
    ]
    const manifest = await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records,
      tombstones: {},
    })
    expect(manifest.version).toBe(1)
    expect(manifest.streamVersion).toBe(1)

    const pulled = await pullStream({
      store,
      streamKey,
      roster,
      accountId: ACCOUNT,
      streamId: STREAM,
    })
    expect(pulled.records.size).toBe(2)
    expect(pulled.records.get("status:h:1")?.data).toEqual({
      status: "pending",
    })
    expect(pulled.streamVersion).toBe(1)
  })

  it("reuses unchanged shards and rewrites only the affected shard", async () => {
    const { device, deviceId, streamKey, store } = await setup()
    const ids = Array.from({ length: 40 }, (_, index) => `status:h:${index}`)
    const records = ids.map((id) =>
      record(id, "2026-01-01T00:00:00.000Z", { index: id }),
    )
    const first = await buildStreamPush({
      streamKey,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records,
      tombstones: {},
    })
    const noop = await buildStreamPush({
      streamKey,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records,
      tombstones: {},
      baseManifest: first.manifest,
      baseTombstones: {},
    })
    expect(noop.uploads).toHaveLength(0)
    expect(noop.manifest.shards).toEqual(first.manifest.shards)

    const changed = records.map((entry) =>
      entry.recordId === ids[3]
        ? record(entry.recordId, "2026-01-02T00:00:00.000Z", { changed: true })
        : entry,
    )
    const one = await buildStreamPush({
      streamKey,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: changed,
      tombstones: {},
      baseManifest: first.manifest,
      baseTombstones: {},
    })
    expect(one.uploads).toHaveLength(1)

    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records,
      tombstones: {},
    })
    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: changed,
      tombstones: {},
      baseManifest: first.manifest,
      baseTombstones: {},
    })
  })

  it("carries explicit tombstones", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: [record("status:h:1", "2026-01-01T00:00:00.000Z", {})],
      tombstones: { "status:h:9": "2026-01-02T00:00:00.000Z" },
    })
    const pulled = await pullStream({
      store,
      streamKey,
      roster,
      accountId: ACCOUNT,
      streamId: STREAM,
    })
    expect(pulled.tombstones).toEqual({
      "status:h:9": "2026-01-02T00:00:00.000Z",
    })
  })

  it("rejects a rollback stream version", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: [record("status:h:1", "2026-01-01T00:00:00.000Z", {})],
      tombstones: {},
    })
    await expect(
      pullStream({
        store,
        streamKey,
        roster,
        accountId: ACCOUNT,
        streamId: STREAM,
        seenStreamVersion: 2,
      }),
    ).rejects.toThrow(/rollback/i)
  })

  it("rejects a tampered shard", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    const manifest = await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: [record("status:h:1", "2026-01-01T00:00:00.000Z", {})],
      tombstones: {},
    })
    const shardId = Number(Object.keys(manifest.shards)[0])
    const path = streamShardPath(ACCOUNT, STREAM, shardId)
    const object = await store.getObject(path)
    object!.body[object!.body.length - 1] ^= 0xff
    await store.putObject(path, object!.body)
    await expect(
      pullStream({ store, streamKey, roster, accountId: ACCOUNT, streamId: STREAM }),
    ).rejects.toThrow(/integrity/i)
  })

  it("syncs two authorized devices to convergence with LWW and tombstones", async () => {
    const { device: host, deviceId: hostId, roster, streamKey, store, dataKey } =
      await setup()
    const guest = generateDeviceKeyPair()
    const guestId = await deviceIdFromSignPublicKey(guest.signPublicKey)
    const { roster: sharedRoster } = await addDeviceToRoster({
      roster,
      approver: host,
      approverDeviceId: hostId,
      newDevice: guest,
      dataKey,
    })

    const base = {
      store,
      streamKey,
      roster: sharedRoster,
      accountId: ACCOUNT,
      streamId: STREAM,
      epoch: 1,
    }
    const recordA = record("status:h:1", "2026-01-01T00:00:00.000Z", { v: 1 })
    const recordB = record("status:h:2", "2026-01-01T00:01:00.000Z", { v: 2 })

    const first = await syncStream({
      ...base,
      device: host,
      deviceId: hostId,
      clientId: "A",
      local: [recordA],
      localTombstones: {},
    })
    expect(first.applied).toHaveLength(0)

    const second = await syncStream({
      ...base,
      device: guest,
      deviceId: guestId,
      clientId: "B",
      local: [recordB],
      localTombstones: {},
    })
    expect(second.applied.map((entry) => entry.recordId)).toContain(
      "status:h:1",
    )

    const third = await syncStream({
      ...base,
      device: host,
      deviceId: hostId,
      clientId: "A",
      local: [recordA],
      localTombstones: {},
      seenStreamVersion: first.streamVersion,
      knownShardHashes: first.shardHashes,
    })
    expect(third.uploaded).toBe(false)
    expect(third.applied.map((entry) => entry.recordId)).toContain(
      "status:h:2",
    )

    const conflict = await syncStream({
      ...base,
      device: guest,
      deviceId: guestId,
      clientId: "B",
      local: [
        record("status:h:1", "2026-01-05T00:00:00.000Z", { v: 99 }),
        recordB,
      ],
      localTombstones: {},
      seenStreamVersion: second.streamVersion,
      knownShardHashes: second.shardHashes,
    })
    expect(conflict.manifest).not.toBeNull()
    expect(conflict.applied).toHaveLength(0)

    const deleted = await syncStream({
      ...base,
      device: host,
      deviceId: hostId,
      clientId: "A",
      local: [recordA, recordB],
      localTombstones: { "status:h:2": "2026-03-01T00:00:00.000Z" },
      seenStreamVersion: third.streamVersion,
      knownShardHashes: third.shardHashes,
      tombstoneRetentionMs: Number.MAX_SAFE_INTEGER,
    })
    expect(deleted.deleted).toContain("status:h:2")

    const final = await pullStream({
      store,
      streamKey,
      roster: sharedRoster,
      accountId: ACCOUNT,
      streamId: STREAM,
    })
    expect(final.records.get("status:h:1")?.data).toEqual({ v: 99 })
    expect(final.records.has("status:h:2")).toBe(false)
  })

  it("propagates a local tombstone and does not resurrect the record", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: [
        record("status:h:1", "2026-01-01T00:00:00.000Z", { v: 1 }),
      ],
      tombstones: {},
    })

    const outcome = await syncStream({
      store,
      streamKey,
      roster,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      local: [],
      localTombstones: { "status:h:1": "2026-02-01T00:00:00.000Z" },
      tombstoneRetentionMs: Number.MAX_SAFE_INTEGER,
    })
    expect(outcome.deleted).toContain("status:h:1")

    const pulled = await pullStream({
      store,
      streamKey,
      roster,
      accountId: ACCOUNT,
      streamId: STREAM,
    })
    expect(pulled.records.has("status:h:1")).toBe(false)
    expect(pulled.tombstones["status:h:1"]).toBeTruthy()
  })

  it("drops tombstones older than the retention window on push", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    await commitStreamPush({
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      records: [record("status:h:9", "2026-01-01T00:00:00.000Z", {})],
      tombstones: { "status:h:8": "2020-01-01T00:00:00.000Z" },
    })

    const outcome = await syncStream({
      store,
      streamKey,
      roster,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
      local: [record("status:h:9", "2026-01-01T00:00:00.000Z", {})],
      localTombstones: {},
      tombstoneRetentionMs: 30 * 24 * 60 * 60 * 1000,
    })
    expect(outcome.tombstones["status:h:8"]).toBeUndefined()

    const pulled = await pullStream({
      store,
      streamKey,
      roster,
      accountId: ACCOUNT,
      streamId: STREAM,
    })
    expect(pulled.tombstones["status:h:8"]).toBeUndefined()
  })
})
