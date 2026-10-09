import { readRemoteVersion } from "@myz/sync-core/remote";
import { readSettings } from "../storage";
import { loadLocalAccount } from "./accountKeyring";
import { loadKeyset } from "./keyring";
import { releaseLock } from "./lock";
import { collectLocalRecords } from "./records";
import { S3Client } from "./s3Client";
import { listDeletions, listRecordStates, writeSyncState } from "./storage";
import {
  acquireSyncLock,
  handleKeyRotation,
  startLockRenewal,
  updateLocalSyncState,
  uploadChanges,
  verifyRemoteKeySeal,
} from "./sync-phases";
import {
  LOCK_PATH,
  buildSyncPlan,
  hasLocalPendingChanges,
  type SyncContext,
  type SyncResult,
} from "./sync-plan";
import {
  ensureSyncState,
  notifyRemoteChanges,
  purgeLocalSyncState,
} from "./sync-state";
import { syncAccountNow } from "./v2/engine";

export type { SyncResult };

/**
 * Legacy (v1) sync orchestration + notifications. When a v2 device-bound
 * account exists, delegates to `syncAccountNow`. Planning/upload/state phases
 * live in `sync-plan.ts` / `sync-phases.ts` / `sync-state.ts`.
 */
export async function syncNow(): Promise<SyncResult> {
  const settings = await readSettings();
  if (!settings.sync?.enabled) {
    return { ok: true, status: "disabled" };
  }
  const account = await loadLocalAccount();
  if (account) return syncAccountNow();

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
    if (!lock.acquired) return { ok: false, status: "locked" };

    const lockPath = `${keyId}/${LOCK_PATH}`;
    const renewal = startLockRenewal(ctx, lockPath);
    try {
      const plan = await buildSyncPlan(ctx);
      const uploadResult = await uploadChanges(ctx, plan);
      await updateLocalSyncState(ctx, plan, uploadResult);
      await notifyRemoteChanges(plan.remoteAppliedCount);
      return { ok: true, status: "synced" };
    } finally {
      renewal.stop();
      await releaseLock({
        client: ctx.client,
        lockPath,
        masterKey: ctx.keyset.masterKey,
        publicKey: ctx.keyset.publicKey,
        clientId: ctx.state.clientId,
      });
    }
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  }
}
