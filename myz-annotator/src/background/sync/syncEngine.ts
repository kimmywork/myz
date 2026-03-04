import { readSettings } from "../storage";
import {
  buildChunkForRecord,
  decryptChunkEnvelope,
  decryptRecordPayload,
} from "./chunks";
import {
  bytesToUtf8,
  packNoncePayload,
  splitNoncePayload,
  sha256,
  utf8ToBytes,
} from "./crypto";
import { runGc } from "./gc";
import {
  clearKeyset,
  loadKeyset,
  sealPublicKey,
  verifySealedPublicKey,
} from "./keyring";
import { acquireLock, releaseLock } from "./lock";
import {
  decryptManifest,
  encryptManifest,
  signManifest,
  verifyManifest,
} from "./manifest";
import {
  applyRecordPayload,
  buildRecordHash,
  collectLocalRecords,
  deserializeRecordPayload,
  deleteLocalRecord,
} from "./records";
import { parseRotationNotice } from "./rotation";
import { S3Client } from "./s3Client";
import {
  clearDeletions,
  clearRecordStates,
  listDeletions,
  listRecordStates,
  readSyncState,
  removeDeletion,
  removeRecordState,
  upsertRecordState,
  upsertDeletion,
  writeSyncState,
} from "./storage";
import type {
  ManifestData,
  ManifestRecordEntry,
  SyncRecord,
  SyncRecordPayload,
} from "./types";
import { bytesToBase64, bytesToHex } from "./utils";
import { SYNC_PROTOCOL_VERSION } from "@/shared/versioning";

const MANIFEST_KEEP_COUNT = 30;
const LOCK_PATH = "lock/lease.bin";

export interface SyncResult {
  ok: boolean;
  status: "disabled" | "missing_key" | "locked" | "synced" | "error";
  message?: string;
}

export async function syncNow(): Promise<SyncResult> {
  const settings = await readSettings();
  if (!settings.sync?.enabled) {
    return { ok: true, status: "disabled" };
  }
  const s3 = settings.sync.s3;
  if (
    !s3?.endpoint ||
    !s3?.bucket ||
    !s3?.accessKeyId ||
    !s3?.secretAccessKey
  ) {
    return { ok: false, status: "error", message: "Missing S3 configuration" };
  }
  const keyset = await loadKeyset();
  if (!keyset) {
    await purgeLocalSyncState();
    return { ok: false, status: "missing_key", message: "Missing keyset" };
  }
  const client = new S3Client(settings.sync.s3);
  const state = await ensureSyncState(keyset.keyId, keyset.epoch);
  const keyId = keyset.keyId;
  const preflightRecords = await collectLocalRecords();
  const preflightRecordStateMap = new Map(
    (await listRecordStates()).map((entry) => [entry.recordId, entry]),
  );
  const preflightDeletionMap = new Map(
    (await listDeletions()).map((entry) => [entry.recordId, entry]),
  );
  const remoteVersion = await readRemoteVersion(client, keyId);
  if (
    remoteVersion !== null &&
    remoteVersion === (state.lastManifestVersion || 0) &&
    !hasLocalPendingChanges(
      preflightRecords,
      preflightRecordStateMap,
      preflightDeletionMap,
    )
  ) {
    await writeSyncState({
      ...state,
      lastSyncAt: new Date().toISOString(),
    });
    return { ok: true, status: "synced" };
  }
  let remoteAppliedCount = 0;

  try {
    const rotationNotice = await client.getObject(`${keyId}/rotation.notice`);
    if (rotationNotice) {
      const notice = await parseRotationNotice(
        keyset.masterKey,
        rotationNotice.body,
      );
      if (notice?.newKeyId === keyId) {
        try {
          await client.deleteObject(`${keyId}/rotation.notice`);
        } catch (error) {
          console.warn("Failed to delete stale rotation notice", error);
        }
      } else {
        await clearKeyset();
        await purgeLocalSyncState();
        return {
          ok: false,
          status: "missing_key",
          message: notice?.newKeyId
            ? `Key rotated: ${notice.newKeyId}`
            : "Key rotated",
        };
      }
    }

    const keySealPath = `${keyId}/meta/keyseal.bin`;
    const sealedRemote = await client.getObject(keySealPath);
    if (!sealedRemote) {
      const sealed = await sealPublicKey(keyset.masterKey, keyset.publicKey);
      await client.putObject(keySealPath, sealed, {
        metadata: { "updated-at": new Date().toISOString() },
      });
    } else {
      const valid = await verifySealedPublicKey(
        keyset.masterKey,
        keyset.publicKey,
        sealedRemote.body,
      );
      if (!valid) {
        await clearKeyset();
        await purgeLocalSyncState();
        return {
          ok: false,
          status: "missing_key",
          message: "Key mismatch",
        };
      }
    }

    const lock = await acquireLock({
      client,
      lockPath: `${keyId}/${LOCK_PATH}`,
      masterKey: keyset.masterKey,
      privateKey: keyset.privateKey,
      publicKey: keyset.publicKey,
      clientId: state.clientId,
    });
    if (!lock.acquired) {
      return { ok: false, status: "locked" };
    }

    try {
      const latestVersion = await readRemoteVersion(client, keyId);
      const remoteManifest = await loadRemoteManifest(
        client,
        keyId,
        keyset,
        latestVersion,
      );
      const localRecords = preflightRecords;
      const localMap = new Map(
        localRecords.map((record) => [record.recordId, record]),
      );
      const recordStateMap = preflightRecordStateMap;
      const deletionMap = preflightDeletionMap;

      const pendingRecords = new Set<string>();
      for (const record of localRecords) {
        const stateEntry = recordStateMap.get(record.recordId);
        if (!stateEntry || stateEntry.recordHash !== record.recordHash) {
          pendingRecords.add(record.recordId);
        }
      }
      const fallbackDeletedAt = state.lastSyncAt || new Date().toISOString();
      for (const recordId of recordStateMap.keys()) {
        if (!localMap.has(recordId) && !deletionMap.has(recordId)) {
          await upsertDeletion({ recordId, deletedAt: fallbackDeletedAt });
          deletionMap.set(recordId, { recordId, deletedAt: fallbackDeletedAt });
        }
      }

      const remoteIndex = remoteManifest?.manifest.recordsIndex || {};
      const remoteChunksIndex = remoteManifest?.manifest.chunksIndex || {};
      const remoteChainHeads = remoteManifest?.manifest.chainHeads || {};

      const chunksToFetch = new Map<string, ManifestRecordEntry>();
      for (const [recordId, entry] of Object.entries(remoteIndex)) {
        if (pendingRecords.has(recordId)) {
          continue;
        }
        const local = localMap.get(recordId);
        const deletion = deletionMap.get(recordId);
        if (
          deletion &&
          Date.parse(deletion.deletedAt) > Date.parse(entry.updatedAt)
        ) {
          continue;
        }
        if (!local) {
          chunksToFetch.set(recordId, entry);
          continue;
        }
        if (Date.parse(entry.updatedAt) > Date.parse(local.updatedAt)) {
          chunksToFetch.set(recordId, entry);
        } else if (entry.updatedAt === local.updatedAt) {
          if (entry.recordHash !== local.recordHash) {
            chunksToFetch.set(recordId, entry);
          }
        }
      }

      const remotePayloads = await fetchRemoteRecords(
        client,
        keyset.masterKey,
        keyId,
        chunksToFetch,
      );
      remoteAppliedCount = remotePayloads.length;
      for (const payload of remotePayloads) {
        await applyRecordPayload(payload);
        localMap.set(payload.recordId, {
          recordId: payload.recordId,
          type: payload.type,
          updatedAt: payload.updatedAt,
          data: payload.data,
          recordHash: await buildRecordHash(payload),
        });
      }

      const remoteCreatedAt = remoteManifest?.manifest.createdAt;
      if (remoteCreatedAt) {
        for (const [recordId, local] of localMap.entries()) {
          if (remoteIndex[recordId]) continue;
          if (pendingRecords.has(recordId)) continue;
          if (Date.parse(local.updatedAt) <= Date.parse(remoteCreatedAt)) {
            await deleteLocalRecord(recordId);
            localMap.delete(recordId);
          }
        }
      }

      const finalRecords = Array.from(localMap.values());
      const needsUpload = hasLocalChanges(finalRecords, remoteIndex);
      let nextVersion = remoteManifest?.manifest.version || 0;
      let nextCreatedAt = remoteManifest?.manifest.createdAt || null;
      if (needsUpload) {
        const version = (remoteManifest?.manifest.version || 0) + 1;
        const createdAt = new Date().toISOString();
        const manifestData: ManifestData = {
          protocolVersion: SYNC_PROTOCOL_VERSION,
          version,
          createdAt,
          clientId: state.clientId,
          baseVersion: remoteManifest?.manifest.version || 0,
          epoch: keyset.epoch,
          recordsIndex: {},
          chunksIndex: {},
          chainHeads: {},
        };

        const uploads: Array<{
          path: string;
          payload: Uint8Array;
          updatedAt: string;
        }> = [];
        for (const record of finalRecords) {
          const remoteEntry = remoteIndex[record.recordId];
          const remoteChunk = remoteEntry
            ? remoteChunksIndex[remoteEntry.chunkId]
            : null;
          const remoteChain = remoteChainHeads[record.recordId];
          const unchanged =
            remoteEntry &&
            remoteEntry.recordHash === record.recordHash &&
            remoteChunk &&
            remoteChain;

          if (unchanged) {
            manifestData.recordsIndex[record.recordId] = { ...remoteEntry };
            manifestData.chunksIndex[remoteEntry.chunkId] = { ...remoteChunk };
            manifestData.chainHeads[record.recordId] = { ...remoteChain };
            continue;
          }

          const prevHash = remoteEntry?.recordHash || "";
          const built = await buildChunkForRecord(
            record,
            keyset.masterKey,
            prevHash,
          );
          const chunkPayload = packNoncePayload(
            built.chunkNonce,
            built.chunkCipher,
          );
          const chunkHash = bytesToHex(await sha256(chunkPayload));
          const chunkEntry = remoteChunksIndex[built.chunkId];
          if (!chunkEntry || chunkEntry.hash !== chunkHash) {
            uploads.push({
              path: `${keyId}/chunks/${built.chunkId}.bin`,
              payload: chunkPayload,
              updatedAt: record.updatedAt,
            });
          }
          manifestData.recordsIndex[record.recordId] = {
            chunkId: built.chunkId,
            updatedAt: record.updatedAt,
            recordHash: record.recordHash,
          };
          manifestData.chunksIndex[built.chunkId] = {
            hash: chunkHash,
            size: chunkPayload.length,
            nonce: bytesToBase64(built.chunkNonce),
          };
          manifestData.chainHeads[record.recordId] = {
            keyId: built.keyId,
            recordHash: record.recordHash,
            updatedAt: record.updatedAt,
          };
        }

        for (const upload of uploads) {
          await client.putObject(upload.path, upload.payload, {
            metadata: { "updated-at": upload.updatedAt },
          });
        }

        const encryptedManifest = await encryptManifest(
          manifestData,
          keyset.masterKey,
        );
        const signature = await signManifest(
          encryptedManifest.plainBytes,
          keyset.privateKey,
        );
        await client.putObject(
          `${keyId}/manifests/${formatManifestVersion(version)}.bin`,
          encryptedManifest.payload,
          { metadata: { "updated-at": createdAt } },
        );
        await client.putObject(
          `${keyId}/manifests/${formatManifestVersion(version)}.sig`,
          signature,
          { metadata: { "updated-at": createdAt } },
        );
        await writeRemoteVersion(client, keyId, version, createdAt);

        await runGc({
          client,
          keyId,
          masterKey: keyset.masterKey,
          keepCount: MANIFEST_KEEP_COUNT,
        });
        nextVersion = version;
        nextCreatedAt = createdAt;
      }

      await updateRecordState(finalRecords);
      await clearResolvedDeletions(finalRecords);
      await writeSyncState({
        ...state,
        keyId,
        lastManifestVersion: nextVersion,
        lastManifestCreatedAt: nextCreatedAt,
        lastSyncAt: new Date().toISOString(),
      });
    } finally {
      await releaseLock({ client, lockPath: `${keyId}/${LOCK_PATH}` });
    }

    await notifyRemoteChanges(remoteAppliedCount);
    return { ok: true, status: "synced" };
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  }
}

async function loadRemoteManifest(
  client: S3Client,
  keyId: string,
  keyset: { masterKey: Uint8Array; publicKey: Uint8Array },
  versionHint?: number | null,
): Promise<{ manifest: ManifestData } | null> {
  if (typeof versionHint === "number" && versionHint > 0) {
    const key = `${keyId}/manifests/${formatManifestVersion(versionHint)}.bin`;
    const manifestPayload = await client.getObject(key);
    if (manifestPayload) {
      const signaturePayload = await client.getObject(
        key.replace(/\.bin$/, ".sig"),
      );
      if (!signaturePayload) {
        throw new Error("Missing manifest signature");
      }
      const { manifest, plainBytes } = await decryptManifest(
        manifestPayload.body,
        versionHint,
        keyset.masterKey,
      );
      const valid = await verifyManifest(
        plainBytes,
        signaturePayload.body,
        keyset.publicKey,
      );
      if (!valid) {
        throw new Error("Invalid manifest signature");
      }
      if (manifest.protocolVersion !== SYNC_PROTOCOL_VERSION) {
        throw new Error("Unsupported sync manifest protocol version");
      }
      return { manifest };
    }
  }
  const manifestListObjects = await client.listObjects(`${keyId}/manifests/`);
  if (!manifestListObjects.length) return null;
  const versions = manifestListObjects
    .map((obj) => ({ key: obj.key, version: parseManifestVersion(obj.key) }))
    .filter((entry) => Number.isFinite(entry.version))
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const latest = versions[0];
  if (!latest || latest.version === null) return null;
  const manifestPayload = await client.getObject(latest.key);
  if (!manifestPayload) return null;
  const signaturePayload = await client.getObject(
    latest.key.replace(/\.bin$/, ".sig"),
  );
  if (!signaturePayload) {
    throw new Error("Missing manifest signature");
  }
  const { manifest, plainBytes } = await decryptManifest(
    manifestPayload.body,
    latest.version,
    keyset.masterKey,
  );
  const valid = await verifyManifest(
    plainBytes,
    signaturePayload.body,
    keyset.publicKey,
  );
  if (!valid) {
    throw new Error("Invalid manifest signature");
  }
  if (manifest.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    throw new Error("Unsupported sync manifest protocol version");
  }
  return { manifest };
}

async function fetchRemoteRecords(
  client: S3Client,
  masterKey: Uint8Array,
  keyId: string,
  records: Map<string, ManifestRecordEntry>,
): Promise<SyncRecordPayload[]> {
  const payloads: SyncRecordPayload[] = [];
  for (const [recordId, entry] of records.entries()) {
    const chunkPayload = await client.getObject(
      `${keyId}/chunks/${entry.chunkId}.bin`,
    );
    if (!chunkPayload) continue;
    const { nonce, ciphertext } = splitNoncePayload(chunkPayload.body, 12);
    const envelope = await decryptChunkEnvelope(
      masterKey,
      entry.chunkId,
      nonce,
      ciphertext,
    );
    if (envelope.recordId !== recordId) continue;
    const recordBytes = await decryptRecordPayload(masterKey, envelope);
    const payload = deserializeRecordPayload(recordBytes);
    payloads.push(payload);
  }
  return payloads;
}

async function updateRecordState(records: SyncRecord[]): Promise<void> {
  const recordIds = new Set(records.map((record) => record.recordId));
  const existing = await listRecordStates();
  await Promise.all(
    existing
      .filter((record) => !recordIds.has(record.recordId))
      .map((record) => removeRecordState(record.recordId)),
  );
  await Promise.all(
    records.map((record) =>
      upsertRecordState({
        recordId: record.recordId,
        recordHash: record.recordHash,
        updatedAt: record.updatedAt,
      }),
    ),
  );
}

async function clearResolvedDeletions(records: SyncRecord[]): Promise<void> {
  await Promise.all(records.map((record) => removeDeletion(record.recordId)));
}

function hasLocalChanges(
  records: SyncRecord[],
  remoteIndex: Record<string, ManifestRecordEntry>,
): boolean {
  for (const record of records) {
    const remote = remoteIndex[record.recordId];
    if (!remote) return true;
    if (remote.recordHash !== record.recordHash) return true;
  }
  for (const recordId of Object.keys(remoteIndex)) {
    if (!records.find((record) => record.recordId === recordId)) {
      return true;
    }
  }
  return false;
}

function formatManifestVersion(version: number) {
  return `v${String(version).padStart(10, "0")}`;
}

function parseManifestVersion(key: string): number | null {
  const match = key.match(/v(\d+)\.bin$/);
  if (!match) return null;
  return Number(match[1]);
}

function hasLocalPendingChanges(
  records: SyncRecord[],
  recordStateMap: Map<
    string,
    { recordId: string; recordHash: string; updatedAt: string }
  >,
  deletionMap: Map<string, { recordId: string; deletedAt: string }>,
) {
  if (deletionMap.size > 0) return true;
  const recordIds = new Set<string>();
  for (const record of records) {
    recordIds.add(record.recordId);
    const stateEntry = recordStateMap.get(record.recordId);
    if (!stateEntry || stateEntry.recordHash !== record.recordHash) {
      return true;
    }
  }
  for (const recordId of recordStateMap.keys()) {
    if (!recordIds.has(recordId)) {
      return true;
    }
  }
  return false;
}

async function readRemoteVersion(
  client: S3Client,
  keyId: string,
): Promise<number | null> {
  const payload = await client.getObject(`${keyId}/meta/version.bin`);
  if (!payload) return null;
  const text = bytesToUtf8(payload.body).trim();
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function writeRemoteVersion(
  client: S3Client,
  keyId: string,
  version: number,
  updatedAt: string,
): Promise<void> {
  const body = utf8ToBytes(String(version));
  await client.putObject(`${keyId}/meta/version.bin`, body, {
    metadata: { "updated-at": updatedAt },
  });
}

async function notifyRemoteChanges(count: number) {
  if (!count) return;
  try {
    await chrome.notifications.create(`myz-sync-${Date.now()}`, {
      type: "basic",
      iconUrl: "assets/icon-128.png",
      title: "同步完成",
      message: `同步到了 ${count} 条新的记录`,
    });
  } catch (error) {
    console.warn("Failed to send sync notification", error);
  }
}

async function ensureSyncState(keyId: string, epoch: number) {
  const state = await readSyncState();
  if (state && state.clientId) {
    return state;
  }
  const clientId =
    state?.clientId ||
    `client_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  const next = {
    id: "state" as const,
    clientId,
    epoch,
    keyId,
    keyUpdatedAt: new Date().toISOString(),
    lastManifestVersion: 0,
    lastManifestCreatedAt: null,
    lastSyncAt: null,
  };
  await writeSyncState(next);
  return next;
}

async function purgeLocalSyncState() {
  await clearRecordStates();
  await clearDeletions();
  await writeSyncState({
    id: "state",
    clientId: "",
    epoch: 0,
    keyId: null,
    keyUpdatedAt: null,
    lastManifestVersion: 0,
    lastManifestCreatedAt: null,
    lastSyncAt: null,
  });
}
