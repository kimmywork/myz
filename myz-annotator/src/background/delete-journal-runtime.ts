/**
 * Chrome wiring for the deferred-delete journal: IndexedDB records, sync
 * tombstones and `chrome.storage.local` intents.
 */
import { recordsStore } from "./stores.js";
import { createDeleteJournal } from "./delete-journal.js";
import {
  deleteHighlights,
  readDeleteJournal,
  writeDeleteJournal,
} from "./storage.js";
import { recordHighlightDeletion } from "./sync/deletions.js";

export const deleteJournal = createDeleteJournal({
  read: readDeleteJournal,
  write: writeDeleteJournal,
  removeRecords: deleteHighlights,
  recordDeletion: recordHighlightDeletion,
  anyPresent: async (ids) => {
    for (const id of ids) {
      if (await recordsStore.get(id)) return true;
    }
    return false;
  },
});

/** Commits overdue intents; awaited by read paths before they render. */
export async function drainDeleteJournal(): Promise<void> {
  try {
    await deleteJournal.drainExpired();
  } catch (error) {
    console.warn("Failed to drain the delete journal", error);
  }
}

/**
 * Drops records whose delete is still pending (undo window) from a read, so
 * closing and reopening the dashboard never shows ghost rows.
 */
export async function withoutPendingDeletes<T extends { id: string }>(
  records: T[],
): Promise<T[]> {
  await drainDeleteJournal();
  const pending = new Set(await deleteJournal.pendingIds());
  if (!pending.size) return records;
  return records.filter((record) => !pending.has(record.id));
}
