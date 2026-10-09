import {
  formatManifestVersion,
  writeRemoteVersion,
} from "@myz/sync-core/remote";
import { runGc } from "./gc";
import { clearKeyset, sealPublicKey, verifySealedPublicKey } from "./keyring";
import { acquireLock, releaseLock, renewLock } from "./lock";
import { encryptManifest, signManifest } from "./manifest";
import { parseRotationNotice } from "./rotation";
import {
  listRecordStates,
  removeDeletion,
  removeRecordState,
  upsertRecordState,
  writeSyncState,
} from "./storage";
import {
  LOCK_LEASE_MS,
  LOCK_PATH,
  LOCK_RENEW_INTERVAL_MS,
  MANIFEST_KEEP_COUNT,
  type SyncContext,
  type SyncPlan,
  type SyncResult,
} from "./sync-plan";
import { purgeLocalSyncState } from "./sync-state";
import type { SyncRecord } from "./types";

/** Detect a rotated key from the remote notice; recalibrate or abort. */
export async function handleKeyRotation(
  ctx: SyncContext,
): Promise<SyncResult | null> {
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

/** Verify the remote public-key seal, creating it on first sync. */
export async function verifyRemoteKeySeal(ctx: SyncContext): Promise<void> {
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

export async function acquireSyncLock(ctx: SyncContext) {
  return acquireLock({
    client: ctx.client,
    lockPath: `${ctx.keyset.keyId}/${LOCK_PATH}`,
    masterKey: ctx.keyset.masterKey,
    privateKey: ctx.keyset.privateKey,
    publicKey: ctx.keyset.publicKey,
    clientId: ctx.state.clientId,
    leaseMs: LOCK_LEASE_MS,
  });
}

export function startLockRenewal(ctx: SyncContext, lockPath: string) {
  const interval = setInterval(() => {
    void renewLock({
      client: ctx.client,
      lockPath,
      masterKey: ctx.keyset.masterKey,
      privateKey: ctx.keyset.privateKey,
      publicKey: ctx.keyset.publicKey,
      clientId: ctx.state.clientId,
      leaseMs: LOCK_LEASE_MS,
    })
      .then((result) => {
        if (!result.acquired) {
          console.warn("Failed to renew sync lock; another client may hold it");
        }
      })
      .catch((error) => {
        console.warn("Failed to renew sync lock", error);
      });
  }, LOCK_RENEW_INTERVAL_MS);
  return { stop: () => clearInterval(interval) };
}

export { releaseLock };

export async function uploadChanges(
  ctx: SyncContext,
  plan: SyncPlan,
): Promise<{ nextVersion: number; nextCreatedAt: string | null }> {
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

export async function updateLocalSyncState(
  ctx: SyncContext,
  plan: SyncPlan,
  uploadResult: { nextVersion: number; nextCreatedAt: string | null },
): Promise<void> {
  const finalRecords = Array.from(plan.localMap.values());
  await updateRecordState(finalRecords);
  await clearResolvedDeletions(finalRecords);
  await writeSyncState({
    ...ctx.state,
    keyId: ctx.keyset.keyId,
    lastManifestVersion: uploadResult.nextVersion,
    lastManifestCreatedAt: uploadResult.nextCreatedAt,
    lastSyncAt: new Date().toISOString(),
  });
}
