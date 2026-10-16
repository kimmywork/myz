import type { z } from "zod";

/**
 * Payload codec registry.
 *
 * Sync is data-agnostic: `sync-core` carries `{ recordId, updatedAt, data }`
 * with `data: unknown`. This registry lives on the domain side and maps an
 * explicit `schemaId` (plus version) carried on the payload back to a concrete,
 * validated, migrated type — so a single stream can hold heterogeneous record
 * types without `sync-core` ever importing a domain schema.
 */
export interface PayloadCodec<T = unknown> {
  /** Stable discriminator carried on synced record payloads. */
  schemaId: string;
  /** Current schema version; `migrate` upgrades older blobs to it. */
  currentVersion: number;
  schema: z.ZodType<T>;
  /** Upgrade a blob decoded at `fromVersion` to `currentVersion`. */
  migrate?: (blob: unknown, fromVersion: number) => unknown;
  /**
   * Materialize unknown payloads opaquely instead of resolving a schema.
   * Required so an unrecognized `schemaId` is preserved, never dropped
   * (see `docs/plan/core-refactor.md` D1).
   */
}

export interface PayloadCodecRegistry {
  register<T>(codec: PayloadCodec<T>): void;
  get(schemaId: string): PayloadCodec | undefined;
  has(schemaId: string): boolean;
  /** Upgrade `blob` to the codec's current version, then parse it. */
  parse<T = unknown>(schemaId: string, blob: unknown, fromVersion: number): T;
}

export function createPayloadCodecRegistry(
  initial: readonly PayloadCodec[] = [],
): PayloadCodecRegistry {
  const byId = new Map<string, PayloadCodec>(
    initial.map((codec) => [codec.schemaId, codec]),
  );
  return {
    register(codec) {
      byId.set(codec.schemaId, codec);
    },
    get(schemaId) {
      return byId.get(schemaId);
    },
    has(schemaId) {
      return byId.has(schemaId);
    },
    parse<T>(schemaId: string, blob: unknown, fromVersion: number): T {
      const codec = byId.get(schemaId);
      if (!codec) {
        throw new Error(`Unknown payload schemaId: ${schemaId}`);
      }
      const upgraded =
        fromVersion >= codec.currentVersion || !codec.migrate
          ? blob
          : codec.migrate(blob, fromVersion);
      return codec.schema.parse(upgraded) as T;
    },
  };
}
