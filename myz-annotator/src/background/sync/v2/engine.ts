import { syncAccountStreams } from "@myz/sync-core/accountSync";
import { acquireLock, releaseLock, renewLock } from "@myz/sync-core/lock";
import { readSettings } from "../../storage";
import { loadLocalAccount } from "../accountKeyring";
import { loadOrCreateDeviceKeys } from "../deviceKeyring";
import { S3Client } from "../s3Client";
import { readSyncState, writeSyncState } from "../storage";
import type { SyncResult } from "../syncEngine";
import { createHighlightDataset } from "./datasets";
import { createStreamStateStore } from "./stateStore";

const LOCK_LEASE_MS = 30_000;

function generateClientId(): string {
  return `client_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * v2 device-bound sync: sync every stream of the local account, guarded by an
 * account-scoped lease with renewal and ownership-checked release.
 */
export async function syncAccountNow(): Promise<SyncResult> {
  const account = await loadLocalAccount();
  if (!account) {
    return { ok: false, status: "missing_account", message: "No sync account" };
  }
  const settings = await readSettings();
  const s3 = settings.sync?.s3;
  if (
    !s3?.endpoint ||
    !s3?.bucket ||
    !s3?.accessKeyId ||
    !s3?.secretAccessKey
  ) {
    return { ok: false, status: "error", message: "Missing S3 configuration" };
  }
  const { pair } = await loadOrCreateDeviceKeys();
  const existing = await readSyncState();
  const clientId = existing?.clientId || generateClientId();
  const client = new S3Client(s3);
  const lockPath = `${account.accountId}/lock/lease.bin`;

  const lock = await acquireLock({
    client,
    lockPath,
    masterKey: account.masterKey,
    privateKey: pair.signPrivateKey,
    publicKey: pair.signPublicKey,
    clientId,
    leaseMs: LOCK_LEASE_MS,
  });
  if (!lock.acquired) {
    return { ok: false, status: "locked" };
  }

  const interval = setInterval(() => {
    void renewLock({
      client,
      lockPath,
      masterKey: account.masterKey,
      privateKey: pair.signPrivateKey,
      publicKey: pair.signPublicKey,
      clientId,
      leaseMs: LOCK_LEASE_MS,
    }).catch((error) => {
      console.warn("Failed to renew v2 sync lock", error);
    });
  }, LOCK_LEASE_MS / 2);

  try {
    const result = await syncAccountStreams({
      store: client,
      account,
      device: pair,
      clientId,
      datasets: [createHighlightDataset()],
      stateStore: createStreamStateStore(),
    });
    await writeSyncState({
      id: "state",
      clientId,
      epoch: account.epoch,
      keyId: account.accountId,
      keyUpdatedAt: existing?.keyUpdatedAt || new Date().toISOString(),
      lastManifestVersion: existing?.lastManifestVersion || 0,
      lastManifestCreatedAt: existing?.lastManifestCreatedAt || null,
      lastSyncAt: new Date().toISOString(),
    });
    const failed = result.streams.find((stream) => stream.error);
    return {
      ok: !failed,
      status: failed ? "error" : "synced",
      message: failed ? failed.error : `v2 synced (${result.applied} applied)`,
    };
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  } finally {
    clearInterval(interval);
    await releaseLock({
      client,
      lockPath,
      masterKey: account.masterKey,
      publicKey: pair.signPublicKey,
      clientId,
    });
  }
}
