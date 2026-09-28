import { describe, expect, it } from "vitest"
import { deriveMasterKeyFromDataKey, deriveStreamMasterKey, generateDataKey } from "../src/dataKey"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"
import { createGenesisRoster } from "../src/roster"
import { commitStreamPush, type StreamRecordInput } from "../src/streamClient"
import { gcStream } from "../src/streamGc"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const ACCOUNT = "acct_gc"
const STREAM = "inbox"

async function setup() {
  const device = generateDeviceKeyPair()
  const dataKey = generateDataKey()
  const roster = await createGenesisRoster({ accountId: ACCOUNT, device, dataKey })
  const masterKey = await deriveMasterKeyFromDataKey(dataKey)
  const streamKey = await deriveStreamMasterKey(masterKey, STREAM)
  const deviceId = await deviceIdFromSignPublicKey(device.signPublicKey)
  return { device, deviceId, roster, streamKey, store: new InMemoryObjectStore() }
}

function record(recordId: string, updatedAt: string, data: unknown): StreamRecordInput {
  return { recordId, updatedAt, data }
}

describe("per-stream GC", () => {
  it("prunes old manifests and deletes unreferenced shards", async () => {
    const { device, deviceId, roster, streamKey, store } = await setup()
    const base = {
      store,
      streamKey,
      device,
      deviceId,
      accountId: ACCOUNT,
      streamId: STREAM,
      clientId: "c1",
      epoch: 1,
    }
    const m1 = await commitStreamPush({
      ...base,
      records: [record("status:h:1", "2026-01-01T00:00:00.000Z", { v: 1 })],
      tombstones: {},
    })
    const tombstones = { "status:h:1": "2026-01-02T00:00:00.000Z" }
    const m2 = await commitStreamPush({
      ...base,
      records: [record("status:h:2", "2026-01-01T00:01:00.000Z", { v: 2 })],
      tombstones,
      baseManifest: m1,
    })
    const m3 = await commitStreamPush({
      ...base,
      records: [record("status:h:2", "2026-01-03T00:00:00.000Z", { v: 3 })],
      tombstones,
      baseManifest: m2,
      baseTombstones: tombstones,
    })

    const result = await gcStream({
      store,
      accountId: ACCOUNT,
      streamId: STREAM,
      streamKey,
      roster,
      keepManifests: 2,
    })
    expect(result.deletedManifests).toBe(1)

    const manifests = (
      await store.listObjects(`${ACCOUNT}/streams/${STREAM}/manifests/`)
    ).filter((object) => object.key.endsWith(".bin"))
    expect(manifests).toHaveLength(2)

    const refs = new Set<string>()
    for (const manifest of [m2, m3]) {
      for (const shardId of Object.keys(manifest.shards)) refs.add(`s:${shardId}`)
      for (const shardId of Object.keys(manifest.tombstoneShards)) {
        refs.add(`t:${shardId}`)
      }
    }
    const shardObjects = await store.listObjects(
      `${ACCOUNT}/streams/${STREAM}/shards/`,
    )
    for (const object of shardObjects) {
      const shardId = object.key.match(/\/(\d+)\.bin$/)?.[1]
      expect(shardId && refs.has(`s:${shardId}`)).toBe(true)
    }
  })
})
