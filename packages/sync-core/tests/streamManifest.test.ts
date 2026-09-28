import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import { describe, expect, it } from "vitest"
import { deriveMasterKeyFromDataKey, deriveStreamMasterKey, generateDataKey } from "../src/dataKey"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"
import { createGenesisRoster } from "../src/roster"
import {
  assertStreamAdvance,
  assertStreamReadable,
  openStreamManifest,
  sealStreamManifest,
  streamManifestPath,
  type StreamManifest,
} from "../src/streamManifest"

async function fixture() {
  const host = generateDeviceKeyPair()
  const dataKey = generateDataKey()
  const roster = await createGenesisRoster({
    accountId: "acct_stream",
    device: host,
    dataKey,
  })
  const masterKey = await deriveMasterKeyFromDataKey(dataKey)
  const streamKey = await deriveStreamMasterKey(masterKey, "inbox")
  const manifest: StreamManifest = {
    protocolVersion: SYNC_PROTOCOL_VERSION_V2,
    accountId: "acct_stream",
    streamId: "inbox",
    streamVersion: 1,
    minReaderVersion: 1,
    features: [],
    version: 1,
    baseVersion: 0,
    epoch: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    clientId: "c1",
    shardCount: 64,
    recordsIndex: {},
    shards: {},
    tombstoneShards: {},
    signedBy: await deviceIdFromSignPublicKey(host.signPublicKey),
  }
  return { host, roster, streamKey, manifest }
}

describe("v2 stream manifest", () => {
  it("seals and opens a signed manifest", async () => {
    const { host, roster, streamKey, manifest } = await fixture()
    const { payload, signature } = await sealStreamManifest({
      manifest,
      streamKey,
      device: host,
    })
    const opened = await openStreamManifest({
      payload,
      signature,
      streamKey,
      version: 1,
      roster,
    })
    expect(opened).toEqual(manifest)
  })

  it("rejects a manifest signed by a non-roster device", async () => {
    const { roster, streamKey, manifest } = await fixture()
    const outsider = generateDeviceKeyPair()
    const outsiderId = await deviceIdFromSignPublicKey(outsider.signPublicKey)
    const { payload, signature } = await sealStreamManifest({
      manifest: { ...manifest, signedBy: outsiderId },
      streamKey,
      device: outsider,
    })
    await expect(
      openStreamManifest({ payload, signature, streamKey, version: 1, roster }),
    ).rejects.toThrow(/unauthorized/i)
  })

  it("rejects a tampered manifest payload", async () => {
    const { host, roster, streamKey, manifest } = await fixture()
    const { payload, signature } = await sealStreamManifest({
      manifest,
      streamKey,
      device: host,
    })
    const tampered = new Uint8Array(payload)
    tampered[tampered.length - 1] ^= 0xff
    await expect(
      openStreamManifest({
        payload: tampered,
        signature,
        streamKey,
        version: 1,
        roster,
      }),
    ).rejects.toThrow()
  })

  it("rejects a rollback stream version", async () => {
    const { manifest } = await fixture()
    expect(() => assertStreamAdvance(1, manifest)).not.toThrow()
    expect(() => assertStreamAdvance(2, manifest)).toThrow(/rollback/i)
  })

  it("rejects a manifest requiring a newer reader", async () => {
    const { manifest } = await fixture()
    expect(() => assertStreamReadable(manifest, 1)).not.toThrow()
    expect(() =>
      assertStreamReadable({ ...manifest, minReaderVersion: 3 }, 1),
    ).toThrow(/reader version/i)
  })

  it("builds deterministic stream paths", () => {
    expect(streamManifestPath("acct", "inbox", 7)).toBe(
      "acct/streams/inbox/manifests/v0000000007.bin",
    )
  })
})
