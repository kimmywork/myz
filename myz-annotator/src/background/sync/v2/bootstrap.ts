import type { SyncObjectStore } from "@myz/sync-core/adapters";
import {
  fetchRemoteRecords,
  loadRemoteManifest,
  readRemoteVersion,
} from "@myz/sync-core/remote";
import type { SyncS3Settings } from "@myz/sync-core/settings";
import type { SyncRecordPayload } from "@myz/sync-core/types";
import { readSettings } from "../../storage";
import { createLocalAccount } from "../accountKeyring";
import { clearKeyset, deriveKeysetFromSecret, loadKeyset } from "../keyring";
import { applyRecordPayload } from "../records";
import { S3Client } from "../s3Client";
import { clearDeletions, clearRecordStates } from "../storage";
import { syncAccountNow } from "./engine";

export interface LegacyKeyset {
  keyId: string;
  masterKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * One-time best-effort rescue: pull every record from the legacy v1 root using
 * the old keyset and return the payloads (the caller merges them locally).
 */
export async function pullLegacyRemote(
  store: SyncObjectStore,
  keyset: LegacyKeyset,
): Promise<SyncRecordPayload[]> {
  const version = await readRemoteVersion(store, keyset.keyId);
  const snapshot = await loadRemoteManifest(
    store,
    keyset.keyId,
    keyset,
    version,
  );
  if (!snapshot) return [];
  const records = new Map(Object.entries(snapshot.manifest.recordsIndex));
  return fetchRemoteRecords(
    store,
    keyset.masterKey,
    keyset.keyId,
    records,
    snapshot.manifest.chunksIndex,
    snapshot.manifest.chainHeads,
  );
}

export interface LegacyMigrationResult {
  /** How many legacy remote records were merged locally. */
  rescued: number;
  /** Whether a legacy v1 keyset existed at all. */
  hasLegacy: boolean;
}

/**
 * Rescue step: pull every record from the legacy v1 root with the stored old
 * keyset and merge it locally. Idempotent (LWW merge), so it can be re-run.
 * Returns `hasLegacy: false` when this device was never on the old format.
 */
export async function migrateLegacyRemote(
  options: { secret?: string; s3?: Partial<SyncS3Settings> } = {},
): Promise<LegacyMigrationResult> {
  const stored = await loadKeyset();
  const secret = options.secret?.trim();
  const keyset = secret
    ? await deriveKeysetFromSecret(secret, stored?.epoch ?? 1)
    : stored;
  if (!keyset) {
    return { rescued: 0, hasLegacy: false };
  }
  const settings = await readSettings();
  const s3 = { ...settings.sync?.s3, ...(options.s3 || {}) } as SyncS3Settings;
  if (
    !s3?.endpoint ||
    !s3?.bucket ||
    !s3?.accessKeyId ||
    !s3?.secretAccessKey
  ) {
    throw new Error("请先配置并启用 S3 同步");
  }
  const store = new S3Client(s3);
  const payloads = await pullLegacyRemote(store, keyset);
  for (const payload of payloads) {
    await applyRecordPayload(payload);
  }
  return { rescued: payloads.length, hasLegacy: true };
}

/**
 * Finalize step: purge the legacy keyset and v1 sync metadata. Call this only
 * after the first v2 sync has succeeded, so a partial run can be resumed.
 */
export async function cleanupLegacy(): Promise<void> {
  await clearKeyset();
  await clearRecordStates();
  await clearDeletions();
}

/**
 * Clean-break bootstrap: optionally rescue legacy remote records into the local
 * store, create a new v2 account, upload local data, then purge the legacy
 * keyset and sync metadata. Not a compatibility layer — it runs once.
 */
export async function bootstrapV2Account(
  options: { rescue?: boolean } = {},
): Promise<{ accountId: string; rescued: number }> {
  const settings = await readSettings();
  const s3 = settings.sync?.s3;
  if (
    !s3?.endpoint ||
    !s3?.bucket ||
    !s3?.accessKeyId ||
    !s3?.secretAccessKey
  ) {
    throw new Error("请先配置并启用 S3 同步");
  }

  let rescued = 0;
  if (options.rescue) {
    try {
      rescued = (await migrateLegacyRemote()).rescued;
    } catch (error) {
      console.warn("Legacy rescue failed", error);
    }
  }

  const account = await createLocalAccount();
  await syncAccountNow();
  await cleanupLegacy();
  return { accountId: account.accountId, rescued };
}
