import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import { describe, expect, it } from "vitest"
import { ManifestDataSchemaV2, RosterSchemaV2 } from "../src/schemas/v2"

const roster = {
  protocolVersion: SYNC_PROTOCOL_VERSION_V2,
  accountId: "acct_example",
  rosterVersion: 1,
  epoch: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  devices: [
    {
      deviceId: "d1",
      signPub: "c2lnbg==",
      agreePub: "YWdyZWU=",
      addedAt: "2026-01-01T00:00:00.000Z",
      addedBy: null,
    },
  ],
  wrappedD: [
    { deviceId: "d1", epoch: 1, ephPub: "ZQ==", nonce: "bg==", cipher: "Yw==" },
  ],
  signedBy: "d1",
  signature: "c2ln",
}

const manifest = {
  protocolVersion: SYNC_PROTOCOL_VERSION_V2,
  streamId: "inbox",
  streamVersion: 1,
  minReaderVersion: 1,
  features: [],
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  clientId: "c1",
  baseVersion: 0,
  epoch: 1,
  shardCount: 64,
  recordsIndex: {},
  shards: {},
  tombstoneShards: {},
  signedBy: "d1",
}

describe("v2 protocol schemas", () => {
  it("parses a valid roster", () => {
    expect(RosterSchemaV2.safeParse(roster).success).toBe(true)
  })

  it("rejects the old protocol version on a v2 roster", () => {
    expect(
      RosterSchemaV2.safeParse({ ...roster, protocolVersion: "1.0.0" }).success,
    ).toBe(false)
  })

  it("parses a sharded manifest with tombstone shards", () => {
    expect(ManifestDataSchemaV2.safeParse(manifest).success).toBe(true)
  })

  it("rejects a manifest without a signed shardCount", () => {
    const { shardCount: _shardCount, ...withoutShardCount } = manifest
    expect(ManifestDataSchemaV2.safeParse(withoutShardCount).success).toBe(false)
  })
})
