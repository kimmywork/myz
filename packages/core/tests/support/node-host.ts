/**
 * A minimal in-memory host implementation of the `@myz/core` ports.
 *
 * It exists to prove the domain layer is host-independent: the same services
 * and read models that run on IndexedDB in the extension run here against plain
 * Maps, with no chrome/DOM. A desktop/mobile host would swap this for SQLite
 * or files; the core code does not change.
 */
import type { MyZRecord } from "@myz/shared/types";
import type {
  ChangeBus,
  ChangeEvent,
} from "../../src/changes.js";
import type {
  InboxStateRecord,
  InboxStateStore,
  OpaqueRecord,
  RecordsStore,
  SettingsStore,
} from "../../src/ports.js";

export interface NodeHost {
  records: RecordsStore;
  inbox: InboxStateStore;
  settings: SettingsStore<Record<string, unknown>>;
  changes: ChangeBus;
}

export function createNodeHost(
  initialSettings: Record<string, unknown> = {},
): NodeHost {
  const records = new Map<string, MyZRecord>();
  const opaque = new Map<string, OpaqueRecord>();
  const inbox = new Map<string, InboxStateRecord>();
  const listeners = new Set<(event: ChangeEvent) => void>();
  let settings = { ...initialSettings };
  let seq = 0;

  return {
    records: {
      async get(id) {
        return records.get(id) ?? null;
      },
      async getByUrl(url) {
        return [...records.values()].filter((record) => record.url === url);
      },
      async listAll() {
        return [...records.values()];
      },
      async upsert(record) {
        records.set(record.id, record);
      },
      async remove(id) {
        records.delete(id);
      },
      async putOpaque(record) {
        opaque.set(`${record.streamId}:${record.recordId}`, record);
      },
      async listOpaque(streamId) {
        return [...opaque.values()].filter(
          (record) => !streamId || record.streamId === streamId,
        );
      },
      async deleteOpaque(streamId, recordId) {
        opaque.delete(`${streamId}:${recordId}`);
      },
    },
    inbox: {
      async get(recordId) {
        return inbox.get(recordId);
      },
      async listAll() {
        return [...inbox.values()];
      },
      async put(record) {
        inbox.set(record.recordId, record);
      },
      async remove(recordId) {
        inbox.delete(recordId);
      },
    },
    settings: {
      async read() {
        return settings;
      },
      async write(patch) {
        settings = { ...settings, ...patch };
        return settings;
      },
    },
    changes: {
      publish(event) {
        const full: ChangeEvent = {
          ...event,
          id: `e${++seq}`,
          at: Date.now(),
        };
        for (const listener of [...listeners]) listener(full);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}
