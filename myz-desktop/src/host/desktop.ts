import type {
  DashboardHost,
  DashboardTheme,
  ImportStrategy,
  RecordImportResult,
  RecordExportResult,
  RecordQuery,
  SyncConnectionTestResult,
  SyncConfig,
  SyncRunReason,
  SyncRunResult,
  SyncSetSecretResult,
  SyncStatus,
} from "@myz/dashboard-core/host";
import type { ConversationInfo, Message } from "@myz/ai-core/types";
import {
  DASHBOARD_HOST_CAPABILITY_PRESETS,
  DASHBOARD_HOST_FEATURE_PRESETS,
} from "@myz/dashboard-core/host";
import type { MyZRecord } from "@myz/shared";
import { toJsonRecord } from "@myz/shared/typeUtils";
import type { SyncGetObjectResult, SyncObjectInfo, SyncObjectStore, SyncPutOptions } from "@myz/sync-core";
import {
  fetchRemoteRecords,
  loadRemoteManifest,
  readRemoteVersion,
  sealPublicKey,
  type SyncConversationBundle,
  type SyncRecord,
  type SyncRecordPayload,
  verifySealedPublicKey,
} from "@myz/sync-core";
import { buildChunkForRecord } from "@myz/sync-core/chunks";
import { sha256, utf8ToBytes } from "@myz/sync-core/crypto";
import { runGc } from "@myz/sync-core/gc";
import { acquireLock, releaseLock } from "@myz/sync-core/lock";
import { encryptManifest, signManifest } from "@myz/sync-core/manifest";
import { formatManifestVersion, writeRemoteVersion } from "@myz/sync-core/remote";
import { buildRotationNotice, parseRotationNotice } from "@myz/sync-core/rotation";
import type { ManifestData, ManifestRecordEntry } from "@myz/sync-core/types";
import { bytesToBase64, bytesToHex, stableStringify } from "@myz/sync-core/utils";
import { invoke } from "@tauri-apps/api/core";
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import type { DesktopStoredSettings } from "../dashboard/types/settings";
import { clearKeyset, deriveKeysetFromSecret, loadKeyset, storeKeyset } from "./syncKeyring";
import {
  clearDeletions,
  clearRecordStates,
  listDeletions,
  listRecordStates,
  readDesktopSyncStatus,
  readSyncState,
  removeDeletion,
  removeRecordState,
  upsertDeletion,
  upsertRecordState,
  writeDesktopSyncStatus,
  writeSyncState,
} from "./syncStorage";

const LOCK_PATH = "lock/lease.bin";
const MANIFEST_KEEP_COUNT = 30;
const HIGHLIGHT_PREFIX = "h:";
const CONVERSATION_PREFIX = "ai:";

async function listRecords(_query?: RecordQuery): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_list_records");
}

async function getRecord(recordId: string): Promise<MyZRecord | null> {
  return invoke<MyZRecord | null>("desktop_get_record", { recordId });
}

async function saveRecord(record: MyZRecord): Promise<MyZRecord> {
  return invoke<MyZRecord>("desktop_save_record", { record });
}

async function saveRecords(records: MyZRecord[]): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_save_records", { records });
}

async function removeRecords(recordIds: string[]): Promise<void> {
  return invoke("desktop_remove_records", { recordIds });
}

async function exportRecords(): Promise<RecordExportResult> {
  return invoke<RecordExportResult>("desktop_export_records");
}

async function importRecords(input: {
  records: MyZRecord[];
  strategy: ImportStrategy;
}): Promise<RecordImportResult> {
  return invoke<RecordImportResult>("desktop_import_records", { input });
}

async function getSettings(): Promise<DesktopStoredSettings> {
  return invoke<DesktopStoredSettings>("desktop_get_settings");
}

async function updateSettings(
  patch: Partial<DesktopStoredSettings>,
): Promise<DesktopStoredSettings> {
  return invoke<DesktopStoredSettings>("desktop_update_settings", { patch });
}

async function getTheme(): Promise<DashboardTheme | null> {
  return invoke<DashboardTheme | null>("desktop_get_theme");
}

async function setTheme(theme: DashboardTheme): Promise<void> {
  return invoke("desktop_set_theme", { theme });
}

async function getSyncConfig(): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_get_sync_config");
}

async function desktopSyncTestConnection(patch?: Partial<SyncConfig>): Promise<void> {
  await invoke("desktop_sync_test_connection", {
    patch: patch
      ? {
          ...patch,
          s3: patch.s3 ? { ...patch.s3 } : undefined,
        }
      : undefined,
  });
}

function createDesktopSyncObjectStore(): SyncObjectStore {
  return {
    async listObjects(prefix: string): Promise<SyncObjectInfo[]> {
      return invoke<SyncObjectInfo[]>("desktop_sync_list_objects", { prefix });
    },
    async getObject(path: string): Promise<SyncGetObjectResult | null> {
      const result = await invoke<{ body: number[]; etag?: string } | null>(
        "desktop_sync_get_object",
        { path },
      );
      if (!result) return null;
      return {
        body: new Uint8Array(result.body),
        etag: result.etag,
      };
    },
    async putObject(
      path: string,
      body: Uint8Array,
      options?: SyncPutOptions,
    ): Promise<void> {
      await invoke("desktop_sync_put_object", {
        input: {
          path,
          body: Array.from(body),
          options,
        },
      });
    },
    async deleteObject(path: string): Promise<void> {
      await invoke("desktop_sync_delete_object", { path });
    },
  };
}

async function updateSyncConfig(
  patch: Partial<SyncConfig>,
): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_update_sync_config", { patch });
}

function ensureSyncConfig(config: SyncConfig) {
  if (!config.enabled) {
    throw new Error("请先启用同步");
  }
  if (config.provider.trim() !== "s3") {
    throw new Error("桌面端当前仅支持 S3 同步配置");
  }
  if (!config.s3.endpoint.trim()) {
    throw new Error("S3 Endpoint 不能为空");
  }
  if (!config.s3.bucket.trim()) {
    throw new Error("Bucket 不能为空");
  }
  if (!config.s3.accessKeyId.trim()) {
    throw new Error("Access Key ID 不能为空");
  }
  if (!config.s3.secretAccessKey.trim()) {
    throw new Error("Secret Access Key 不能为空");
  }
}

function recordIdForHighlight(id: string) {
  return `${HIGHLIGHT_PREFIX}${id}`;
}

function recordIdForConversation(id: string) {
  return `${CONVERSATION_PREFIX}${id}`;
}

function resolveUpdatedAt(value?: string) {
  if (value && typeof value === "string") {
    return value;
  }
  return new Date().toISOString();
}

async function buildRecordHash(payload: SyncRecordPayload): Promise<string> {
  const json = stableStringify(payload);
  const bytes = utf8ToBytes(json);
  const digest = await sha256(bytes);
  return Array.from(digest)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function collectLocalSyncRecords(): Promise<SyncRecord[]> {
  const records: SyncRecord[] = [];
  const [highlights, conversations] = await Promise.all([
    listRecords(),
    listConversations(),
  ]);

  for (const highlight of highlights) {
    const updatedAt = resolveUpdatedAt(highlight.updatedAt || highlight.createdAt);
    const payload: SyncRecordPayload = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      recordId: recordIdForHighlight(highlight.id),
      type: "highlight",
      updatedAt,
      data: highlight,
    };
    records.push({
      recordId: payload.recordId,
      type: payload.type,
      updatedAt,
      data: highlight,
      recordHash: await buildRecordHash(payload),
    });
  }

  for (const conversation of conversations) {
    const updatedAt = resolveUpdatedAt(
      conversation.updatedAt || conversation.createdAt,
    );
    const messages = await getMessages(conversation.id);
    const metadata = conversation.metadata
      ? toJsonRecord(conversation.metadata)
      : undefined;
    const data: SyncConversationBundle = {
      conversation: { ...conversation, metadata },
      messages,
    };
    const payload: SyncRecordPayload = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      recordId: recordIdForConversation(conversation.id),
      type: "ai-conversation",
      updatedAt,
      data,
    };
    records.push({
      recordId: payload.recordId,
      type: payload.type,
      updatedAt,
      data,
      recordHash: await buildRecordHash(payload),
    });
  }

  return records;
}

function hasLocalPendingChanges(
  records: SyncRecord[],
  recordStateMap: Map<string, { recordId: string; recordHash: string; updatedAt: string }>,
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

async function countPendingSyncRecords(config: SyncConfig): Promise<number> {
  if (!config.enabled) {
    return 0;
  }
  const [records, recordStates, deletions] = await Promise.all([
    collectLocalSyncRecords(),
    listRecordStates(),
    listDeletions(),
  ]);
  return hasLocalPendingChanges(
    records,
    new Map(recordStates.map((entry) => [entry.recordId, entry])),
    new Map(deletions.map((entry) => [entry.recordId, entry])),
  )
    ? records.length + deletions.length
    : 0;
}

async function ensureDesktopSyncState(keyId: string, epoch: number) {
  const state = await readSyncState();
  if (state?.clientId) {
    return state;
  }
  const next = {
    id: "state" as const,
    clientId: `desktop_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
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

async function getSyncStatus(): Promise<SyncStatus> {
  const [config, state, statusRecord, pendingRecords] = await Promise.all([
    getSyncConfig(),
    readSyncState(),
    readDesktopSyncStatus(),
    getSyncConfig().then((current) => countPendingSyncRecords(current)),
  ]);
  return {
    enabled: config.enabled,
    state: config.enabled ? statusRecord?.state || "idle" : "idle",
    lastSyncAt: state?.lastSyncAt || null,
    pendingRecords,
    lastError: config.enabled ? statusRecord?.lastError || null : null,
    keyId: state?.keyId || null,
    keyUpdatedAt: state?.keyUpdatedAt || null,
    lastManifestVersion: state?.lastManifestVersion || 0,
  };
}

async function setDesktopSyncStatus(state: SyncStatus["state"], lastError: string | null) {
  await writeDesktopSyncStatus({
    id: "status",
    state,
    lastError,
  });
}

async function testSyncConnection(
  configPatch?: Partial<SyncConfig>,
): Promise<SyncConnectionTestResult> {
  const base = await getSyncConfig();
  const config: SyncConfig = {
    ...base,
    ...configPatch,
    s3: {
      ...base.s3,
      ...(configPatch?.s3 || {}),
    },
  };
  ensureSyncConfig(config);
  await desktopSyncTestConnection(configPatch);
  return { ok: true };
}

async function setSyncSecret(secret: string): Promise<SyncSetSecretResult> {
  if (!secret.trim()) {
    throw new Error("请输入同步密钥");
  }
  const existing = await readSyncState();
  const previousKeyset = await loadKeyset();
  const config = await getSyncConfig();
  const baseEpoch = existing?.epoch || 1;
  const keyset = await deriveKeysetFromSecret(secret.trim(), baseEpoch);
  const sameKeyId = previousKeyset?.keyId === keyset.keyId;
  const nextEpoch = sameKeyId ? baseEpoch : (existing?.epoch || 0) + 1;
  keyset.epoch = nextEpoch;
  const keyUpdatedAt = new Date().toISOString();
  await storeKeyset(keyset);
  if (!sameKeyId) {
    await clearRecordStates();
    await clearDeletions();
  }
  await writeSyncState({
    id: "state",
    clientId:
      existing?.clientId ||
      `desktop_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    epoch: keyset.epoch,
    keyId: keyset.keyId,
    keyUpdatedAt,
    lastManifestVersion: 0,
    lastManifestCreatedAt: null,
    lastSyncAt: null,
  });
  if (
    previousKeyset &&
    !sameKeyId &&
    config.enabled &&
    config.s3.endpoint &&
    config.s3.bucket &&
    config.s3.accessKeyId &&
    config.s3.secretAccessKey
  ) {
    try {
      const client = createDesktopSyncObjectStore();
      const notice = await buildRotationNotice(
        previousKeyset.masterKey,
        keyset.keyId,
      );
      await client.putObject(
        `${previousKeyset.keyId}/rotation.notice`,
        notice,
        { metadata: { "updated-at": keyUpdatedAt } },
      );
    } catch (error) {
      console.warn("Failed to write desktop rotation notice", error);
    }
  }
  await setDesktopSyncStatus("idle", null);
  return {
    keyId: keyset.keyId,
    keyUpdatedAt,
  };
}

async function clearSyncSecret(): Promise<void> {
  const state = await readSyncState();
  await clearKeyset();
  await clearRecordStates();
  await clearDeletions();
  await writeSyncState({
    id: "state",
    clientId: state?.clientId || "",
    epoch: 0,
    keyId: null,
    keyUpdatedAt: null,
    lastManifestVersion: 0,
    lastManifestCreatedAt: null,
    lastSyncAt: null,
  });
  await setDesktopSyncStatus("idle", null);
}

async function applyDesktopRemotePayload(payload: SyncRecordPayload): Promise<void> {
  if (payload.type === "highlight") {
    await saveRecord(payload.data as MyZRecord);
    return;
  }
  if (payload.type === "ai-conversation") {
    const data = payload.data as SyncConversationBundle;
    await saveConversation({
      ...data.conversation,
      updatedAt: payload.updatedAt,
    });
    await replaceMessages(data.conversation.id, data.messages || []);
  }
}

async function deleteDesktopLocalRecord(recordId: string): Promise<void> {
  if (recordId.startsWith("h:")) {
    await removeRecords([recordId.slice(2)]);
    return;
  }
  if (recordId.startsWith("ai:")) {
    await deleteConversation(recordId.slice(3));
  }
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

async function runSync(_reason?: SyncRunReason): Promise<SyncRunResult> {
  const finishedAt = new Date().toISOString();
  const config = await getSyncConfig();
  const pendingRecords = await countPendingSyncRecords(config);
  try {
    ensureSyncConfig(config);
    const keyset = await loadKeyset();
    if (!keyset) {
      throw new Error("请先设置同步密钥");
    }

    await setDesktopSyncStatus("syncing", null);
    const client = createDesktopSyncObjectStore();
    const state = await ensureDesktopSyncState(keyset.keyId, keyset.epoch);
    const keyId = keyset.keyId;
    const preflightRecords = await collectLocalSyncRecords();
    const preflightRecordStateMap = new Map(
      (await listRecordStates()).map((entry) => [entry.recordId, entry]),
    );
    const preflightDeletionMap = new Map(
      (await listDeletions()).map((entry) => [entry.recordId, entry]),
    );

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
          console.warn("Failed to delete stale desktop rotation notice", error);
        }
      } else {
        await clearKeyset();
        await clearRecordStates();
        await clearDeletions();
        await writeSyncState({
          ...state,
          keyId: null,
          keyUpdatedAt: null,
          lastManifestVersion: 0,
          lastManifestCreatedAt: null,
          lastSyncAt: null,
        });
        throw new Error(
          notice?.newKeyId
            ? `Key rotated: ${notice.newKeyId}`
            : "Key rotated",
        );
      }
    }

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
        lastSyncAt: finishedAt,
      });
      await setDesktopSyncStatus("idle", null);
      return {
        ok: true,
        state: "idle",
        syncedRecords: 0,
        skippedRecords: 0,
        finishedAt,
        message: "远端与本地都没有新增变更。",
      };
    }

    const keySealPath = `${keyId}/meta/keyseal.bin`;
    const sealedRemote = await client.getObject(keySealPath);
    if (!sealedRemote) {
      const sealed = await sealPublicKey(keyset.masterKey, keyset.publicKey);
      await client.putObject(keySealPath, sealed, {
        metadata: { "updated-at": finishedAt },
      });
    } else {
      const valid = await verifySealedPublicKey(
        keyset.masterKey,
        keyset.publicKey,
        sealedRemote.body,
      );
      if (!valid) {
        await clearKeyset();
        await clearRecordStates();
        await clearDeletions();
        await writeSyncState({
          ...state,
          keyId: null,
          keyUpdatedAt: null,
          lastManifestVersion: 0,
          lastManifestCreatedAt: null,
          lastSyncAt: null,
        });
        throw new Error("Key mismatch");
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
      await setDesktopSyncStatus("error", "同步仓库当前被其他客户端占用，请稍后重试。");
      return {
        ok: false,
        state: "error",
        syncedRecords: 0,
        skippedRecords: pendingRecords,
        finishedAt,
        message: "同步仓库当前被其他客户端占用，请稍后重试。",
      };
    }

    let remoteAppliedCount = 0;
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

      const pendingLocalRecords = new Set<string>();
      for (const record of localRecords) {
        const stateEntry = recordStateMap.get(record.recordId);
        if (!stateEntry || stateEntry.recordHash !== record.recordHash) {
          pendingLocalRecords.add(record.recordId);
        }
      }

      const fallbackDeletedAt = state.lastSyncAt || finishedAt;
      for (const recordId of recordStateMap.keys()) {
        if (!localMap.has(recordId) && !deletionMap.has(recordId)) {
          await upsertDeletion({ recordId, deletedAt: fallbackDeletedAt });
          deletionMap.set(recordId, { recordId, deletedAt: fallbackDeletedAt });
        }
      }

      const remoteIndex = remoteManifest?.manifest.recordsIndex || {};
      const remoteChunksIndex = remoteManifest?.manifest.chunksIndex || {};
      const remoteChainHeads = remoteManifest?.manifest.chainHeads || {};

      const recordsToFetch = new Map<string, ManifestRecordEntry>();
      for (const [recordId, entry] of Object.entries(remoteIndex)) {
        if (pendingLocalRecords.has(recordId)) {
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
          recordsToFetch.set(recordId, entry);
          continue;
        }
        if (Date.parse(entry.updatedAt) > Date.parse(local.updatedAt)) {
          recordsToFetch.set(recordId, entry);
        } else if (
          entry.updatedAt === local.updatedAt &&
          entry.recordHash !== local.recordHash
        ) {
          recordsToFetch.set(recordId, entry);
        }
      }

      const remotePayloads = await fetchRemoteRecords(
        client,
        keyset.masterKey,
        keyId,
        recordsToFetch,
      );
      remoteAppliedCount = remotePayloads.length;
      for (const payload of remotePayloads) {
        await applyDesktopRemotePayload(payload);
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
          if (pendingLocalRecords.has(recordId)) continue;
          if (Date.parse(local.updatedAt) <= Date.parse(remoteCreatedAt)) {
            await deleteDesktopLocalRecord(recordId);
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
          const chunkPayload = new Uint8Array(
            built.chunkNonce.length + built.chunkCipher.length,
          );
          chunkPayload.set(built.chunkNonce, 0);
          chunkPayload.set(built.chunkCipher, built.chunkNonce.length);
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
      await Promise.all(
        Array.from(deletionMap.keys())
          .filter((recordId) => !finalRecords.some((record) => record.recordId === recordId))
          .map((recordId) => removeDeletion(recordId)),
      );
      await writeSyncState({
        ...state,
        keyId,
        lastManifestVersion: nextVersion,
        lastManifestCreatedAt: nextCreatedAt,
        lastSyncAt: finishedAt,
      });
    } finally {
      await releaseLock({ client, lockPath: `${keyId}/${LOCK_PATH}` });
    }

    await setDesktopSyncStatus("idle", null);
    return {
      ok: true,
      state: "idle",
      syncedRecords: remoteAppliedCount,
      skippedRecords: pendingRecords > remoteAppliedCount ? pendingRecords - remoteAppliedCount : 0,
      finishedAt,
      message:
        remoteAppliedCount > 0
          ? `已完成双向同步，并从远端应用 ${remoteAppliedCount} 条记录。`
          : "已完成双向同步。",
    };
  } catch (error) {
    const message = (error as Error).message;
    await setDesktopSyncStatus("error", message);
    return {
      ok: false,
      state: "error",
      syncedRecords: 0,
      skippedRecords: pendingRecords,
      finishedAt,
      message,
    };
  }
}

export interface DesktopChatRepository {
  listConversations(): Promise<ConversationInfo[]>;
  getConversation(conversationId: string): Promise<ConversationInfo | null>;
  saveConversation(conversation: ConversationInfo): Promise<ConversationInfo>;
  deleteConversation(conversationId: string): Promise<void>;
  getMessages(conversationId: string): Promise<Message[]>;
  replaceMessages(
    conversationId: string,
    messages: Message[],
  ): Promise<Message[]>;
  getActiveConversationId(): Promise<string | null>;
  setActiveConversationId(
    conversationId: string | null,
  ): Promise<string | null>;
  getWorkspaceContext(): Promise<DesktopWorkspaceContext>;
}

export interface DesktopWorkspaceContext {
  workspaceRoot: string;
  agentsFile: string;
  scopeLabel: string;
}

export interface DesktopWorkspaceEntry {
  path: string;
  kind: string;
}

export interface DesktopWorkspaceListResult {
  basePath: string;
  entries: DesktopWorkspaceEntry[];
}

export interface DesktopWorkspaceReadResult {
  path: string;
  content: string;
}

export interface DesktopWorkspaceWriteInput {
  path: string;
  content: string;
  mode?: string;
}

export interface DesktopWorkspaceWriteResult {
  path: string;
  mode: string;
  bytesWritten: number;
}

export interface DesktopWorkspaceEditInput {
  path: string;
  find: string;
  replace: string;
  replaceAll?: boolean;
}

export interface DesktopWorkspaceEditResult {
  path: string;
  replacements: number;
}

export interface DesktopWorkspaceGlobResult {
  pattern: string;
  matches: string[];
}

export interface DesktopAgentToolHost {
  listWorkspace(
    path?: string,
    depth?: number,
  ): Promise<DesktopWorkspaceListResult>;
  readWorkspaceFile(path: string): Promise<DesktopWorkspaceReadResult>;
  writeWorkspaceFile(
    input: DesktopWorkspaceWriteInput,
  ): Promise<DesktopWorkspaceWriteResult>;
  editWorkspaceFile(
    input: DesktopWorkspaceEditInput,
  ): Promise<DesktopWorkspaceEditResult>;
  globWorkspace(pattern: string): Promise<DesktopWorkspaceGlobResult>;
}

async function listConversations(): Promise<ConversationInfo[]> {
  return invoke<ConversationInfo[]>("desktop_chat_list_conversations");
}

async function getConversation(
  conversationId: string,
): Promise<ConversationInfo | null> {
  return invoke<ConversationInfo | null>("desktop_chat_get_conversation", {
    conversationId,
  });
}

async function saveConversation(
  conversation: ConversationInfo,
): Promise<ConversationInfo> {
  return invoke<ConversationInfo>("desktop_chat_save_conversation", {
    conversation,
  });
}

async function deleteConversation(conversationId: string): Promise<void> {
  return invoke("desktop_chat_delete_conversation", { conversationId });
}

async function getMessages(conversationId: string): Promise<Message[]> {
  return invoke<Message[]>("desktop_chat_get_messages", { conversationId });
}

async function replaceMessages(
  conversationId: string,
  messages: Message[],
): Promise<Message[]> {
  return invoke<Message[]>("desktop_chat_replace_messages", {
    conversationId,
    messages,
  });
}

async function getActiveConversationId(): Promise<string | null> {
  return invoke<string | null>("desktop_chat_get_active_conversation_id");
}

async function setActiveConversationId(
  conversationId: string | null,
): Promise<string | null> {
  return invoke<string | null>("desktop_chat_set_active_conversation_id", {
    conversationId,
  });
}

async function getWorkspaceContext(): Promise<DesktopWorkspaceContext> {
  return invoke<DesktopWorkspaceContext>("desktop_chat_get_workspace_context");
}

async function listWorkspace(
  path?: string,
  depth?: number,
): Promise<DesktopWorkspaceListResult> {
  return invoke<DesktopWorkspaceListResult>("desktop_agent_list_workspace", {
    path,
    depth,
  });
}

async function readWorkspaceFile(
  path: string,
): Promise<DesktopWorkspaceReadResult> {
  return invoke<DesktopWorkspaceReadResult>(
    "desktop_agent_read_workspace_file",
    {
      path,
    },
  );
}

async function writeWorkspaceFile(
  input: DesktopWorkspaceWriteInput,
): Promise<DesktopWorkspaceWriteResult> {
  return invoke<DesktopWorkspaceWriteResult>(
    "desktop_agent_write_workspace_file",
    {
      input,
    },
  );
}

async function editWorkspaceFile(
  input: DesktopWorkspaceEditInput,
): Promise<DesktopWorkspaceEditResult> {
  return invoke<DesktopWorkspaceEditResult>(
    "desktop_agent_edit_workspace_file",
    {
      input,
    },
  );
}

async function globWorkspace(
  pattern: string,
): Promise<DesktopWorkspaceGlobResult> {
  return invoke<DesktopWorkspaceGlobResult>("desktop_agent_glob_workspace", {
    input: { pattern },
  });
}

export function createDesktopDashboardHost(): DashboardHost<DesktopStoredSettings> {
  return {
    kind: "desktop",
    capabilities: DASHBOARD_HOST_CAPABILITY_PRESETS.desktop,
    features: DASHBOARD_HOST_FEATURE_PRESETS.desktop,
    records: {
      listRecords,
      getRecord,
      saveRecord,
      saveRecords,
      removeRecords,
      exportRecords,
      importRecords,
    },
    settings: {
      getSettings,
      updateSettings,
    },
    theme: {
      getTheme,
      setTheme,
    },
    sync: {
      getConfig: getSyncConfig,
      updateConfig: updateSyncConfig,
      getStatus: getSyncStatus,
      testConnection: testSyncConnection,
      setSecret: setSyncSecret,
      clearSecret: clearSyncSecret,
      runSync,
    },
  };
}

export const desktopDashboardHost = createDesktopDashboardHost();

export const desktopChatHost: DesktopChatRepository = {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getMessages,
  replaceMessages,
  getActiveConversationId,
  setActiveConversationId,
  getWorkspaceContext,
};

export const desktopAgentHost: DesktopAgentToolHost = {
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  editWorkspaceFile,
  globWorkspace,
};
