import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import {
  fetchRemoteRecords,
  formatManifestVersion,
  loadRemoteManifest,
  readRemoteVersion,
  writeRemoteVersion,
} from "@myz/sync-core/remote";
import { readSettings } from "../storage";
import { buildChunkForRecord } from "./chunks";
import { packNoncePayload, sha256 } from "./crypto";
import { runGc } from "./gc";
import {
  clearKeyset,
  loadKeyset,
  sealPublicKey,
  verifySealedPublicKey,
} from "./keyring";
import { acquireLock, releaseLock } from "./lock";
import { encryptManifest, signManifest } from "./manifest";
import {
  applyRecordPayload,
  buildRecordHash,
  collectLocalRecords,
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
import type { ManifestData, ManifestRecordEntry, SyncRecord } from "./types";
import { bytesToBase64, bytesToHex } from "./utils";

const MANIFEST_KEEP_COUNT = 30;
const LOCK_PATH = "lock/lease.bin";

export interface SyncResult {
  ok: boolean;
  status: "disabled" | "missing_key" | "locked" | "synced" | "error";
  message?: string;
}

interface SyncContext {
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

  const ctx: SyncContext = {
    settings,
    s3,
    keyset,
    keyId,
    state,
    client,
    preflightRecords,
    preflightRecordStateMap,
    preflightDeletionMap,
  };

  try {
    const rotation = await handleKeyRotation(ctx);
    if (rotation) return rotation;

    await verifyRemoteKeySeal(ctx);

    const lock = await acquireSyncLock(ctx);
    if (!lock.acquired) {
      return { ok: false, status: "locked" };
    }

    try {
      const plan = await buildSyncPlan(ctx);
      await applyRemoteChanges(ctx, plan);
      const uploadResult = await uploadChanges(ctx, plan);
      await updateLocalSyncState(ctx, plan, uploadResult);
      await notifyRemoteChanges(plan.remoteAppliedCount);
      return { ok: true, status: "synced" };
    } finally {
      await releaseLock({
        client: ctx.client,
        lockPath: `${keyId}/${LOCK_PATH}`,
      });
    }
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  }
}

async function handleKeyRotation(ctx: SyncContext): Promise<SyncResult | null> {
  const { client, keyset, keyId } = ctx;
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
  return null;
}

async function verifyRemoteKeySeal(ctx: SyncContext): Promise<void> {
  const { client, keyset, keyId } = ctx;
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
      throw new Error("Key mismatch");
    }
  }
}

async function acquireSyncLock(ctx: SyncContext) {
  return acquireLock({
    client: ctx.client,
    lockPath: `${ctx.keyset.keyId}/${LOCK_PATH}`,
    masterKey: ctx.keyset.masterKey,
    privateKey: ctx.keyset.privateKey,
    publicKey: ctx.keyset.publicKey,
    clientId: ctx.state.clientId,
  });
}

interface SyncPlan {
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

async function buildSyncPlan(ctx: SyncContext): Promise<SyncPlan> {
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
  const localRecords = preflightRecords;
  const localMap = new Map<string, SyncRecord>(
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
  const remoteAppliedCount = remotePayloads.length;
  for (const payload of remotePayloads) {
    await applyRecordPayload(payload);
    const record: SyncRecord = {
      recordId: payload.recordId,
      type: payload.type,
      updatedAt: payload.updatedAt,
      data: payload.data,
      recordHash: await buildRecordHash(payload),
    };
    localMap.set(payload.recordId, record);
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
  const uploads: Array<{
    path: string;
    payload: Uint8Array;
    updatedAt: string;
  }> = [];
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

async function applyRemoteChanges(
  _ctx: SyncContext,
  _plan: SyncPlan,
): Promise<void> {
  // Remote changes are already applied inside buildSyncPlan via fetchRemoteRecords
  // This phase exists for explicit separation of concerns.
}

async function uploadChanges(
  ctx: SyncContext,
  plan: SyncPlan,
): Promise<{
  nextVersion: number;
  nextCreatedAt: string | null;
}> {
  const { client, keyset, keyId } = ctx;
  if (!plan.needsUpload || !plan.manifestData) {
    return {
      nextVersion: plan.remoteManifestVersion,
      nextCreatedAt: plan.remoteCreatedAt,
    };
  }

  for (const upload of plan.uploads) {
    await client.putObject(upload.path, upload.payload, {
      metadata: { "updated-at": upload.updatedAt },
    });
  }

  const encryptedManifest = await encryptManifest(
    plan.manifestData,
    keyset.masterKey,
  );
  const signature = await signManifest(
    encryptedManifest.plainBytes,
    keyset.privateKey,
  );
  await client.putObject(
    `${keyId}/manifests/${formatManifestVersion(plan.manifestData.version)}.bin`,
    encryptedManifest.payload,
    { metadata: { "updated-at": plan.manifestData.createdAt } },
  );
  await client.putObject(
    `${keyId}/manifests/${formatManifestVersion(plan.manifestData.version)}.sig`,
    signature,
    { metadata: { "updated-at": plan.manifestData.createdAt } },
  );
  await writeRemoteVersion(
    client,
    keyId,
    plan.manifestData.version,
    plan.manifestData.createdAt,
  );

  await runGc({
    client,
    keyId,
    masterKey: keyset.masterKey,
    keepCount: MANIFEST_KEEP_COUNT,
  });

  return {
    nextVersion: plan.manifestData.version,
    nextCreatedAt: plan.manifestData.createdAt,
  };
}

async function updateLocalSyncState(
  ctx: SyncContext,
  plan: SyncPlan,
  uploadResult: { nextVersion: number; nextCreatedAt: string | null },
): Promise<void> {
  const { state } = ctx;
  const finalRecords = Array.from(plan.localMap.values());
  await updateRecordState(finalRecords);
  await clearResolvedDeletions(finalRecords);
  await writeSyncState({
    ...state,
    keyId: ctx.keyset.keyId,
    lastManifestVersion: uploadResult.nextVersion,
    lastManifestCreatedAt: uploadResult.nextCreatedAt,
    lastSyncAt: new Date().toISOString(),
  });
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
