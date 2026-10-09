import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import {
  fetchRemoteRecords,
  loadRemoteManifest,
  readRemoteVersion,
} from "@myz/sync-core/remote";
import { readSettings } from "../storage";
import { buildChunkForRecord } from "./chunks";
import { packNoncePayload, sha256 } from "./crypto";
import { loadKeyset } from "./keyring";
import {
  applyRecordPayload,
  buildRecordHash,
  collectLocalRecords,
  deleteLocalRecord,
} from "./records";
import { S3Client } from "./s3Client";
import { upsertDeletion } from "./storage";
import { ensureSyncState } from "./sync-state";
import type { ManifestData, ManifestRecordEntry, SyncRecord } from "./types";
import { bytesToBase64, bytesToHex } from "./utils";

export const MANIFEST_KEEP_COUNT = 30;
export const LOCK_PATH = "lock/lease.bin";
export const LOCK_LEASE_MS = 30_000;
export const LOCK_RENEW_INTERVAL_MS = LOCK_LEASE_MS / 2;

export interface SyncResult {
  ok: boolean;
  status:
    | "disabled"
    | "missing_key"
    | "missing_account"
    | "locked"
    | "synced"
    | "error";
  message?: string;
}

export interface SyncContext {
  settings: Awaited<ReturnType<typeof readSettings>>;
  s3: NonNullable<Awaited<ReturnType<typeof readSettings>>["sync"]["s3"]>;
  keyset: NonNullable<Awaited<ReturnType<typeof loadKeyset>>>;
  keyId: string;
  state: Awaited<ReturnType<typeof ensureSyncState>>;
  client: S3Client;
  preflightRecords: Awaited<ReturnType<typeof collectLocalRecords>>;
  preflightRecordStateMap: Map<
    string,
    { recordId: string; recordHash: string; updatedAt: string }
  >;
  preflightDeletionMap: Map<string, { recordId: string; deletedAt: string }>;
}

export interface SyncPlan {
  remoteAppliedCount: number;
  localMap: Map<string, SyncRecord>;
  remoteIndex: Record<string, ManifestRecordEntry>;
  remoteChunksIndex: Record<
    string,
    { hash: string; size: number; nonce: string }
  >;
  remoteChainHeads: Record<
    string,
    { keyId: string; recordHash: string; updatedAt: string }
  >;
  remoteManifestVersion: number;
  remoteCreatedAt: string | null;
  needsUpload: boolean;
  manifestData?: ManifestData;
  uploads: Array<{ path: string; payload: Uint8Array; updatedAt: string }>;
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
    if (!records.find((record) => record.recordId === recordId)) return true;
  }
  return false;
}

export function hasLocalPendingChanges(
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
    if (!stateEntry || stateEntry.recordHash !== record.recordHash) return true;
  }
  for (const recordId of recordStateMap.keys()) {
    if (!recordIds.has(recordId)) return true;
  }
  return false;
}

/** Fetch the remote manifest, merge remote records locally, and plan uploads. */
export async function buildSyncPlan(ctx: SyncContext): Promise<SyncPlan> {
  const {
    client,
    keyset,
    keyId,
    state,
    preflightRecords,
    preflightRecordStateMap,
    preflightDeletionMap,
  } = ctx;
  const latestVersion = await readRemoteVersion(client, keyId);
  const remoteManifest = await loadRemoteManifest(
    client,
    keyId,
    keyset,
    latestVersion,
  );
  const localMap = new Map<string, SyncRecord>(
    preflightRecords.map((record) => [record.recordId, record]),
  );
  const recordStateMap = preflightRecordStateMap;
  const deletionMap = preflightDeletionMap;

  const pendingRecords = new Set<string>();
  for (const record of preflightRecords) {
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
    if (pendingRecords.has(recordId)) continue;
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
    } else if (
      entry.updatedAt === local.updatedAt &&
      entry.recordHash !== local.recordHash
    ) {
      chunksToFetch.set(recordId, entry);
    }
  }

  const remotePayloads = await fetchRemoteRecords(
    client,
    keyset.masterKey,
    keyId,
    chunksToFetch,
    remoteChunksIndex,
    remoteChainHeads,
  );
  const remoteAppliedCount = remotePayloads.length;
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
  const uploads: SyncPlan["uploads"] = [];
  let manifestData: ManifestData | undefined;

  if (needsUpload) {
    const version = (remoteManifest?.manifest.version || 0) + 1;
    const createdAt = new Date().toISOString();
    manifestData = {
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
  }

  return {
    remoteAppliedCount,
    localMap,
    remoteIndex,
    remoteChunksIndex,
    remoteChainHeads,
    remoteManifestVersion: remoteManifest?.manifest.version || 0,
    remoteCreatedAt: remoteManifest?.manifest.createdAt || null,
    needsUpload,
    manifestData,
    uploads,
  };
}
