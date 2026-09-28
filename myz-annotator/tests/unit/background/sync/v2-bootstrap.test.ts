// @vitest-environment node
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import type { SyncObjectStore } from "@myz/sync-core/adapters";
import { buildChunkForRecord } from "@myz/sync-core/chunks";
import { packNoncePayload, sha256, utf8ToBytes } from "@myz/sync-core/crypto";
import { deriveKeysetFromSecret } from "@myz/sync-core/keyset";
import { encryptManifest, signManifest } from "@myz/sync-core/manifest";
import {
  bytesToBase64,
  bytesToHex,
  stableStringify,
} from "@myz/sync-core/utils";
import { describe, expect, it } from "vitest";
import { pullLegacyRemote } from "@/background/sync/v2/bootstrap";

class MemStore implements SyncObjectStore {
  map = new Map<string, Uint8Array>();
  async listObjects(prefix: string) {
    return Array.from(this.map.keys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key }));
  }
  async getObject(path: string) {
    const body = this.map.get(path);
    return body ? { body, etag: `"${path}"` } : null;
  }
  async putObject(path: string, body: Uint8Array) {
    this.map.set(path, body);
  }
  async deleteObject(path: string) {
    this.map.delete(path);
  }
}

describe("legacy v1 rescue", () => {
  it("pulls and verifies legacy records with the old keyset", async () => {
    const keyset = await deriveKeysetFromSecret("legacy-secret", 1);
    const recordId = "h:legacy-1";
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const data = { id: "legacy-1", text: "rescued" };
    const record = {
      recordId,
      type: "highlight" as const,
      updatedAt,
      data: data as never,
      recordHash: "",
    };
    const payload = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      recordId,
      type: "highlight",
      updatedAt,
      data,
    };
    const recordHash = bytesToHex(
      await sha256(utf8ToBytes(stableStringify(payload))),
    );
    record.recordHash = recordHash;

    const built = await buildChunkForRecord(record, keyset.masterKey, "");
    const chunkBody = packNoncePayload(built.chunkNonce, built.chunkCipher);
    const manifest = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      clientId: "legacy-client",
      baseVersion: 0,
      epoch: 1,
      recordsIndex: {
        [recordId]: { chunkId: built.chunkId, updatedAt, recordHash },
      },
      chunksIndex: {
        [built.chunkId]: {
          hash: bytesToHex(await sha256(chunkBody)),
          size: chunkBody.length,
          nonce: bytesToBase64(built.chunkNonce),
        },
      },
      chainHeads: {
        [recordId]: { keyId: built.keyId, recordHash, updatedAt },
      },
    };
    const encrypted = await encryptManifest(manifest, keyset.masterKey);
    const signature = await signManifest(
      encrypted.plainBytes,
      keyset.privateKey,
    );

    const store = new MemStore();
    await store.putObject(`${keyset.keyId}/meta/version.bin`, utf8ToBytes("1"));
    await store.putObject(
      `${keyset.keyId}/manifests/v0000000001.bin`,
      encrypted.payload,
    );
    await store.putObject(
      `${keyset.keyId}/manifests/v0000000001.sig`,
      signature,
    );
    await store.putObject(
      `${keyset.keyId}/chunks/${built.chunkId}.bin`,
      chunkBody,
    );

    const records = await pullLegacyRemote(store, {
      keyId: keyset.keyId,
      masterKey: keyset.masterKey,
      publicKey: keyset.publicKey,
    });
    expect(records).toHaveLength(1);
    expect(records[0].recordId).toBe(recordId);
    expect(records[0].data).toEqual(data);
  });

  it("returns nothing when there is no legacy remote", async () => {
    const keyset = await deriveKeysetFromSecret("legacy-secret", 1);
    const store = new MemStore();
    const records = await pullLegacyRemote(store, {
      keyId: keyset.keyId,
      masterKey: keyset.masterKey,
      publicKey: keyset.publicKey,
    });
    expect(records).toEqual([]);
  });
});
