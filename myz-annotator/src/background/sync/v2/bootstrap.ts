import type { SyncObjectStore } from "@myz/sync-core/adapters";
import {
  fetchRemoteRecords,
  loadRemoteManifest,
  readRemoteVersion,
} from "@myz/sync-core/remote";
import type { SyncRecordPayload } from "@myz/sync-core/types";
import { readSettings } from "../../storage";
import { createLocalAccount } from "../accountKeyring";
import { loadKeyset, clearKeyset } from "../keyring";
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
    const keyset = await loadKeyset();
    if (keyset) {
      try {
        const store = new S3Client(s3);
        const payloads = await pullLegacyRemote(store, keyset);
        for (const payload of payloads) {
          await applyRecordPayload(payload);
        }
        rescued = payloads.length;
      } catch (error) {
        console.warn("Legacy rescue failed", error);
      }
    }
  }

  const account = await createLocalAccount();
  await syncAccountNow();
  await clearKeyset();
  await clearRecordStates();
  await clearDeletions();
  return { accountId: account.accountId, rescued };
}
