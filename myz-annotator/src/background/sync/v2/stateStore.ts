import type { StreamStateStore } from "@myz/sync-core/accountSync";
import { readStreamState, writeStreamState } from "../storage";

export function createStreamStateStore(): StreamStateStore {
  return {
    async getStreamState(streamId) {
      const record = await readStreamState(streamId);
      if (!record) return null;
      return {
        streamVersion: record.streamVersion,
        shardHashes: record.shardHashes,
        tombstones: record.tombstones,
      };
    },
    async setStreamState(streamId, state) {
      await writeStreamState({ streamId, ...state });
    },
  };
}
