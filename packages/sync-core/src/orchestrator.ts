import type { SyncAccount } from "./account"
import {
  syncAccountStreams,
  type StreamDataset,
  type StreamStateStore,
  type StreamSyncSummary,
} from "./accountSync"
import type { SyncObjectStore } from "./adapters"
import { deriveStreamMasterKey } from "./dataKey"
import type { DeviceKeyPair } from "./deviceKeys"
import {
  acquireLock,
  DEFAULT_LEASE_MS,
  type LockOptions,
  releaseLock,
  renewLock,
} from "./lock"
import { gcStream } from "./streamGc"

/**
 * Host-agnostic account sync orchestrator.
 *
 * Owns the strategy of one account sync: lock lifecycle, per-stream sync,
 * post-upload GC, result aggregation and error containment. It performs no
 * host side effects (badge, notifications, ChangeBus, persistence) and never
 * throws for expected failures: callers receive a structured result instead.
 */

export interface SyncTimers {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

export interface SyncLockOptions {
  leaseMs?: number
  renewIntervalMs?: number
  path?: (accountId: string) => string
}

export interface RunAccountSyncOptions {
  store: SyncObjectStore
  account: SyncAccount
  device: DeviceKeyPair
  clientId: string
  datasets: StreamDataset[]
  stateStore: StreamStateStore
  /** `false` skips the account lock (tests / special hosts). */
  lock?: SyncLockOptions | false
  /** `false` skips post-upload GC. */
  gc?: { keepManifests?: number } | false
  /** Injected timers; omitted means no lease renewal (MV3-safe). */
  timers?: SyncTimers
  now?: () => string
}

export type AccountSyncStatus = "synced" | "locked" | "partial" | "error"

export interface RunAccountSyncResult {
  status: AccountSyncStatus
  applied: number
  streams: StreamSyncSummary[]
  uploadedStreamIds: string[]
  error?: string
  lockLost?: boolean
  startedAt: string
  finishedAt: string
}

/** Default account-level lease path. */
function defaultLockPath(accountId: string): string {
  return `${accountId}/lock/lease.bin`
}

/** Result fields shared by the early-return / error branches. */
function emptyBase(): Pick<
  RunAccountSyncResult,
  "applied" | "streams" | "uploadedStreamIds"
> {
  return { applied: 0, streams: [], uploadedStreamIds: [] }
}

/** Sync every dataset, then GC only the streams that actually uploaded. */
async function syncAndGc(options: RunAccountSyncOptions) {
  const sync = await syncAccountStreams({
    store: options.store,
    account: options.account,
    device: options.device,
    clientId: options.clientId,
    datasets: options.datasets,
    stateStore: options.stateStore,
  })
  if (options.gc === false) return sync
  for (const summary of sync.streams) {
    if (!summary.uploaded) continue
    const streamKey = await deriveStreamMasterKey(
      options.account.masterKey,
      summary.streamId,
    )
    await gcStream({
      store: options.store,
      accountId: options.account.accountId,
      streamId: summary.streamId,
      streamKey,
      roster: options.account.roster,
      keepManifests: options.gc?.keepManifests,
    })
  }
  return sync
}

/** Renew periodically; returns a stop function. Losing the lease is reported. */
function armRenewal(
  lockOptions: LockOptions,
  timers: SyncTimers,
  renewMs: number,
  onLost: () => void,
): () => void {
  const handle = timers.setInterval(() => {
    void renewLock(lockOptions)
      .then((result) => {
        if (!result.acquired) onLost()
      })
      .catch(onLost)
  }, renewMs)
  return () => timers.clearInterval(handle)
}

/**
 * Release the lease without letting a release failure replace the structured
 * result (the release runs in `finally`).
 */
async function releaseLockQuietly(
  options: RunAccountSyncOptions,
  lockOptions: LockOptions,
): Promise<void> {
  await releaseLock({
    client: options.store,
    lockPath: lockOptions.lockPath,
    masterKey: options.account.masterKey,
    clientId: options.clientId,
    roster: options.account.roster,
  }).catch(() => undefined)
}

/**
 * Run one account sync: lock, per-stream sync, GC of uploaded streams, release.
 * Never throws for expected failures; inspect `status` / `error` / `lockLost`.
 */
export async function runAccountSync(
  options: RunAccountSyncOptions,
): Promise<RunAccountSyncResult> {
  const now = options.now ?? (() => new Date().toISOString())
  const startedAt = now()
  const lockConfig = options.lock === false ? null : options.lock
  const leaseMs = lockConfig?.leaseMs ?? DEFAULT_LEASE_MS
  const lockOptions: LockOptions | null = lockConfig
    ? {
        client: options.store,
        lockPath: (lockConfig.path ?? defaultLockPath)(
          options.account.accountId,
        ),
        masterKey: options.account.masterKey,
        privateKey: options.device.signPrivateKey,
        clientId: options.clientId,
        deviceId: options.account.deviceId,
        leaseMs,
        roster: options.account.roster,
      }
    : null

  let lockLost = false
  let stopRenewal: (() => void) | null = null

  if (lockOptions) {
    let acquired: Awaited<ReturnType<typeof acquireLock>>
    try {
      acquired = await acquireLock(lockOptions)
    } catch (error) {
      return {
        ...emptyBase(),
        status: "error",
        error: (error as Error).message,
        startedAt,
        finishedAt: now(),
      }
    }
    if (!acquired.acquired) {
      return {
        ...emptyBase(),
        status: "locked",
        startedAt,
        finishedAt: now(),
      }
    }
    if (options.timers) {
      const renewMs = lockConfig?.renewIntervalMs ?? leaseMs / 2
      stopRenewal = armRenewal(lockOptions, options.timers, renewMs, () => {
        lockLost = true
      })
    }
  }

  try {
    const sync = await syncAndGc(options)
    const failed = sync.streams.some((summary) => summary.error)
    return {
      status: failed ? "partial" : "synced",
      applied: sync.applied,
      streams: sync.streams,
      uploadedStreamIds: sync.streams
        .filter((summary) => summary.uploaded)
        .map((summary) => summary.streamId),
      lockLost: lockLost || undefined,
      startedAt,
      finishedAt: now(),
    }
  } catch (error) {
    return {
      ...emptyBase(),
      status: "error",
      error: (error as Error).message,
      lockLost: lockLost || undefined,
      startedAt,
      finishedAt: now(),
    }
  } finally {
    stopRenewal?.()
    if (lockOptions) await releaseLockQuietly(options, lockOptions)
  }
}
