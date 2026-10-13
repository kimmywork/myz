import type { StreamStateStore } from "@myz/sync-core/accountSync";
import { readStreamState, writeStreamState } from "../storage";

/**
 * Per-stream sync state, scoped to the account that produced it. A record
 * written under a different account — or written before account scoping
 * existed and therefore without an `accountId` — is treated as absent, so a
 * device that just joined a new account starts from a clean high-water mark
 * instead of tripping the anti-rollback gate on the new account's remote.
 */
export function createStreamStateStore(accountId: string): StreamStateStore {
  return {
    async getStreamState(streamId) {
      const record = await readStreamState(streamId);
      if (!record || record.accountId !== accountId) return null;
      return {
        streamVersion: record.streamVersion,
        shardHashes: record.shardHashes,
        tombstones: record.tombstones,
      };
    },
    async setStreamState(streamId, state) {
      await writeStreamState({ accountId, streamId, ...state });
    },
  };
}
