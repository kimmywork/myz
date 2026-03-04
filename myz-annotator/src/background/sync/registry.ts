import {
  SyncRecordPayloadSchemaV1,
  ManifestDataSchemaV1,
  ChunkEnvelopeSchemaV1,
  LockPayloadSchemaV1,
} from "./schemas";
import { createSchemaRegistry } from "@/shared/schemaRegistry";
import { SYNC_PROTOCOL_VERSION } from "@/shared/versioning";

export const SyncRecordPayloadRegistry = createSchemaRegistry({
  latestVersion: SYNC_PROTOCOL_VERSION,
  versions: {
    [SYNC_PROTOCOL_VERSION]: SyncRecordPayloadSchemaV1,
  },
});

export const SyncManifestRegistry = createSchemaRegistry({
  latestVersion: SYNC_PROTOCOL_VERSION,
  versions: {
    [SYNC_PROTOCOL_VERSION]: ManifestDataSchemaV1,
  },
});

export const SyncChunkEnvelopeRegistry = createSchemaRegistry({
  latestVersion: SYNC_PROTOCOL_VERSION,
  versions: {
    [SYNC_PROTOCOL_VERSION]: ChunkEnvelopeSchemaV1,
  },
});

export const SyncLockPayloadRegistry = createSchemaRegistry({
  latestVersion: SYNC_PROTOCOL_VERSION,
  versions: {
    [SYNC_PROTOCOL_VERSION]: LockPayloadSchemaV1,
  },
});
