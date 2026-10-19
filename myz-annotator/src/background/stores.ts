/**
 * IndexedDB implementations of the `@myz/core` storage ports.
 *
 * The port objects are the domain-facing shape; `storage.ts` keeps the raw
 * IndexedDB/chrome access. Other hosts (desktop SQLite, mobile) implement the
 * same ports with their own store.
 */
import type {
  InboxStateStore,
  RecordsStore,
  SettingsStore,
} from "@myz/core/ports";
import type { StagedAssetStore } from "@myz/core/staged-asset";
import type { Settings } from "./settings.js";
import {
  clearStagedAssets,
  deleteHighlight,
  deleteInboxState,
  deleteOpaqueRecord,
  deleteStagedAsset,
  getAllHighlights,
  getAllInboxStates,
  getHighlight,
  getHighlightsForUrl,
  getStagedAsset,
  getStagedAssets,
  listOpaqueRecords,
  putInboxState,
  putOpaqueRecord,
  readInboxState,
  readSettings,
  saveHighlight,
  saveStagedAsset,
  writeSettings,
} from "./storage.js";

export const recordsStore: RecordsStore = {
  get: async (id) => (await getHighlight(id)) ?? null,
  getByUrl: (url) => getHighlightsForUrl(url),
  listAll: () => getAllHighlights(),
  upsert: async (record) => {
    await saveHighlight(record);
  },
  remove: (id) => deleteHighlight(id),
  putOpaque: (record) => putOpaqueRecord(record),
  listOpaque: (streamId) => listOpaqueRecords(streamId),
  deleteOpaque: (streamId, recordId) => deleteOpaqueRecord(streamId, recordId),
};

export const inboxStateStore: InboxStateStore = {
  get: (recordId) => readInboxState(recordId),
  listAll: () => getAllInboxStates(),
  put: (record) => putInboxState(record),
  remove: (recordId) => deleteInboxState(recordId),
};

export const settingsStore: SettingsStore<Settings> = {
  read: () => readSettings(),
  write: (patch) => writeSettings(patch),
};

export const stagedAssetStore: StagedAssetStore = {
  save: (asset) => saveStagedAsset(asset),
  list: () => getStagedAssets(),
  get: (id) => getStagedAsset(id),
  remove: (id) => deleteStagedAsset(id),
  clear: () => clearStagedAssets(),
};
