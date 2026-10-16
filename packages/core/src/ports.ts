/**
 * Storage ports.
 *
 * Host-agnostic persistence boundaries the domain layer depends on. The
 * extension implements them over IndexedDB (`myz-annotator/src/background/stores.ts`);
 * a desktop/mobile host would implement the same interfaces over SQLite or
 * files. Ports are named by intent (domain operations), not by storage shape,
 * so no IndexedDB/chrome concept leaks into the domain.
 */
import type { MyZRecord } from "@myz/shared/types";

/**
 * A synced record we could not materialize (unknown `schemaId` or record-id
 * prefix). It is kept verbatim and handed back to sync so it is never dropped
 * (opaque preservation; see `docs/plan/core-refactor.md` D1).
 */
export interface OpaqueRecord {
  /** Stream the record arrived on, so collect routes it back to the same one. */
  streamId: string;
  recordId: string;
  updatedAt: string;
  data: unknown;
}

/** Persistence for highlight/clip/bookmark records plus opaque overflow. */
export interface RecordsStore {
  get(id: string): Promise<MyZRecord | null>;
  getByUrl(url: string): Promise<MyZRecord[]>;
  /** Newest first. */
  listAll(): Promise<MyZRecord[]>;
  upsert(record: MyZRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** Opaque preservation (D1): keep unknown synced records verbatim. */
  putOpaque(record: OpaqueRecord): Promise<void>;
  /** Opaque records, optionally filtered to one stream. */
  listOpaque(streamId?: string): Promise<OpaqueRecord[]>;
  deleteOpaque(recordId: string): Promise<void>;
}

/** One local workflow-state row (`status:` / `mark:` / `rel:`). */
export interface InboxStateRecord {
  recordId: string;
  kind: "status" | "mark" | "rel";
  changedAt: string;
  payload: unknown;
}

export interface InboxStateStore {
  get(recordId: string): Promise<InboxStateRecord | undefined>;
  listAll(): Promise<InboxStateRecord[]>;
  put(record: InboxStateRecord): Promise<void>;
  remove(recordId: string): Promise<void>;
}

/**
 * Settings persistence. Credential sealing is a keyring/crypto concern and is
 * NOT part of this port — the adapter seals/unseals internally.
 */
export interface SettingsStore<TSettings = unknown> {
  read(): Promise<TSettings>;
  write(patch: Partial<TSettings>): Promise<TSettings>;
}
