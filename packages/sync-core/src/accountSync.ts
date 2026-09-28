import type { SyncAccount } from "./account"
import type { SyncObjectStore } from "./adapters"
import { deriveStreamMasterKey } from "./dataKey"
import type { DeviceKeyPair } from "./deviceKeys"
import {
  syncStream,
  type StreamRecordInput,
  type StreamRemoteRecord,
} from "./streamClient"

export interface StreamDataset {
  streamId: string
  collect(): Promise<StreamRecordInput[]>
  apply(record: StreamRemoteRecord): Promise<void>
  remove(recordId: string): Promise<void>
}

export interface StreamStateSnapshot {
  streamVersion: number
  shardHashes: Record<string, string>
  tombstones: Record<string, string>
}

export interface StreamStateStore {
  getStreamState(streamId: string): Promise<StreamStateSnapshot | null>
  setStreamState(
    streamId: string,
    state: StreamStateSnapshot,
  ): Promise<void>
}

export interface StreamSyncSummary {
  streamId: string
  uploaded: boolean
  applied: number
  deleted: number
  error?: string
}

export interface AccountSyncResult {
  applied: number
  streams: StreamSyncSummary[]
}

/**
 * Sync every dataset of an account. Streams are independent: a failure in one
 * stream is captured on its summary and does not stop the remaining streams.
 */
export async function syncAccountStreams(options: {
  store: SyncObjectStore
  account: SyncAccount
  device: DeviceKeyPair
  clientId: string
  datasets: StreamDataset[]
  stateStore: StreamStateStore
  shardCount?: number
}): Promise<AccountSyncResult> {
  const streams: StreamSyncSummary[] = []
  let applied = 0

  for (const dataset of options.datasets) {
    try {
      const streamKey = await deriveStreamMasterKey(
        options.account.masterKey,
        dataset.streamId,
      )
      const state = await options.stateStore.getStreamState(dataset.streamId)
      const local = await dataset.collect()
      const outcome = await syncStream({
        store: options.store,
        streamKey,
        roster: options.account.roster,
        device: options.device,
        deviceId: options.account.deviceId,
        accountId: options.account.accountId,
        streamId: dataset.streamId,
        clientId: options.clientId,
        epoch: options.account.epoch,
        local,
        localTombstones: state?.tombstones ?? {},
        seenStreamVersion: state?.streamVersion ?? null,
        knownShardHashes: state?.shardHashes,
        shardCount: options.shardCount,
      })

      for (const record of outcome.applied) {
        await dataset.apply(record)
      }
      for (const recordId of outcome.deleted) {
        await dataset.remove(recordId)
      }
      await options.stateStore.setStreamState(dataset.streamId, {
        streamVersion: outcome.streamVersion,
        shardHashes: outcome.shardHashes,
        tombstones: outcome.tombstones,
      })

      applied += outcome.applied.length
      streams.push({
        streamId: dataset.streamId,
        uploaded: outcome.uploaded,
        applied: outcome.applied.length,
        deleted: outcome.deleted.length,
      })
    } catch (error) {
      streams.push({
        streamId: dataset.streamId,
        uploaded: false,
        applied: 0,
        deleted: 0,
        error: (error as Error).message,
      })
    }
  }

  return { applied, streams }
}
