import { DEFAULT_LEASE_MS } from "@myz/sync-core/lock";
import {
  runAccountSync,
  type RunAccountSyncResult,
} from "@myz/sync-core/orchestrator";
import { DEFAULT_KEEP_MANIFESTS } from "@myz/sync-core/streamGc";
import { refreshInboxBadge } from "../../inbox/queue";
import { readSettings } from "../../storage";
import { loadLocalAccount } from "../accountKeyring";
import { loadOrCreateDeviceKeys } from "../deviceKeyring";
import { S3Client } from "../s3Client";
import { readSyncState, writeSyncState } from "../storage";
import type { SyncResult } from "../syncEngine";
import { createHighlightDataset } from "./datasets";
import { createInboxDataset } from "./inboxDataset";
import { createStreamStateStore } from "./stateStore";
import { syncTimers } from "./timers";

/** Stable-per-install client id used to prove lock ownership. */
function generateClientId(): string {
  return `client_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Map the host-agnostic result onto the extension's `SyncResult`. */
function toSyncResult(result: RunAccountSyncResult): SyncResult {
  if (result.status === "synced") {
    return {
      ok: true,
      status: "synced",
      message: `v2 synced (${result.applied} applied)`,
    };
  }
  if (result.status === "partial") {
    const detail = result.streams
      .filter((stream) => stream.error)
      .map((stream) => `${stream.streamId}: ${stream.error}`)
      .join("; ");
    return {
      ok: false,
      status: "error",
      partial: true,
      message: `v2 partial (${result.applied} applied; ${detail})`,
    };
  }
  if (result.status === "locked") {
    return { ok: false, status: "locked" };
  }
  return { ok: false, status: "error", message: result.error };
}

/**
 * v2 device-bound sync: delegate the orchestration (lock, streams, GC,
 * aggregation) to `@myz/sync-core/orchestrator`, then apply host side effects
 * (badge refresh, sync-state persistence) and map the result.
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

  const result = await runAccountSync({
    store: client,
    account,
    device: pair,
    clientId,
    datasets: [createHighlightDataset(), createInboxDataset()],
    stateStore: createStreamStateStore(account.accountId),
    lock: { leaseMs: settings.sync.lockLeaseMs ?? DEFAULT_LEASE_MS },
    gc: {
      keepManifests: settings.sync.keepManifests ?? DEFAULT_KEEP_MANIFESTS,
    },
    timers: syncTimers,
  });

  // Host side effects only run when the sync reached the remote (parity with
  // the pre-orchestrator engine: a thrown sync/GC error skips them).
  if (result.status !== "synced" && result.status !== "partial") {
    return toSyncResult(result);
  }

  try {
    await refreshInboxBadge();
    await writeSyncState({
      id: "state",
      clientId,
      epoch: account.epoch,
      lastManifestVersion: existing?.lastManifestVersion || 0,
      lastManifestCreatedAt: existing?.lastManifestCreatedAt || null,
      lastSyncAt: result.finishedAt,
    });
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  }

  return toSyncResult(result);
}
