/**
 * A minimal in-memory host implementation of the `@myz/core` ports.
 *
 * It exists to prove the domain layer is host-independent: the same services
 * and read models that run on IndexedDB/chrome in the extension run here against
 * plain Maps and simple emitters, with no chrome/DOM. A desktop/mobile host
 * would swap this for SQLite/files/timers; the core code does not change.
 */
import type { MyZRecord } from "@myz/shared/types";
import type { ChangeBus, ChangeEvent } from "../../src/changes.js";
import type {
  InboxStateRecord,
  InboxStateStore,
  Notifier,
  OpaqueRecord,
  RecordsStore,
  Scheduler,
  SettingsStore,
} from "../../src/ports.js";
import type {
  StagedAsset,
  StagedAssetStore,
} from "../../src/staged-asset.js";

export interface NodeHost {
  records: RecordsStore;
  inbox: InboxStateStore;
  settings: SettingsStore<Record<string, unknown>>;
  changes: ChangeBus;
  scheduler: Scheduler;
  notifier: Notifier;
  stagedAssets: StagedAssetStore;
  /** Test helper: fire a scheduled alarm by name. */
  tick(name: string): void;
  /** Test helper: last badge text written. */
  readonly badges: string[];
  /** Test helper: notifications emitted. */
  readonly notifications: Array<{ title: string; message: string }>;
}

export function createNodeHost(
  initialSettings: Record<string, unknown> = {},
): NodeHost {
  const records = new Map<string, MyZRecord>();
  const opaque = new Map<string, OpaqueRecord>();
  const inbox = new Map<string, InboxStateRecord>();
  const staged = new Map<string, StagedAsset>();
  const listeners = new Set<(event: ChangeEvent) => void>();
  const alarms = new Set<string>();
  const tickListeners = new Set<(name: string) => void>();
  const badges: string[] = [];
  const notifications: Array<{ title: string; message: string }> = [];
  let settings = { ...initialSettings };
  let seq = 0;

  function tick(name: string) {
    for (const listener of [...tickListeners]) listener(name);
  }

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
        const full: ChangeEvent = { ...event, id: `e${++seq}`, at: Date.now() };
        for (const listener of [...listeners]) listener(full);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    scheduler: {
      async every(name) {
        alarms.add(name);
      },
      async once(name) {
        alarms.add(name);
      },
      async cancel(name) {
        alarms.delete(name);
      },
      async has(name) {
        return alarms.has(name);
      },
      onTick(listener) {
        tickListeners.add(listener);
        return () => tickListeners.delete(listener);
      },
    },
    notifier: {
      async setBadge(text) {
        badges.push(text);
      },
      async notify(input) {
        notifications.push({ title: input.title, message: input.message });
      },
    },
    stagedAssets: {
      async save(asset) {
        staged.set(asset.id, asset);
      },
      async list() {
        return [...staged.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
      },
      async get(id) {
        return staged.get(id);
      },
      async remove(id) {
        staged.delete(id);
      },
      async clear() {
        staged.clear();
      },
    },
    tick,
    badges,
    notifications,
  };
}
