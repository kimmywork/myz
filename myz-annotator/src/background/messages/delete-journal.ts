/**
 * Message handlers for the deferred-delete intent journal (§4.30).
 *
 * The UI persists an intent before it removes rows, commits when the undo
 * window ends, and cancels on undo or a failed commit.
 */
import { deleteJournal } from "../delete-journal-runtime.js";
import { registerMessageHandler } from "./handler.js";

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw.filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
}

/** Registers queue / cancel / commit / list for pending deletes. */
export function initializeDeleteJournalMessageHandlers(): void {
  registerMessageHandler(
    "myz:queuePendingDelete",
    async (payload: { ids?: string[]; dueAt?: number }) => {
      const ids = normalizeIds(payload?.ids);
      const dueAt = Number(payload?.dueAt);
      if (!ids.length || !Number.isFinite(dueAt)) {
        return { ok: false };
      }
      return { ok: await deleteJournal.queue(ids, dueAt) };
    },
  );

  registerMessageHandler(
    "myz:cancelPendingDelete",
    async (payload: { ids?: string[] }) => {
      const ids = normalizeIds(payload?.ids);
      if (!ids.length) return { ok: false };
      await deleteJournal.cancel(ids);
      return { ok: true };
    },
  );

  registerMessageHandler(
    "myz:commitPendingDelete",
    async (payload: { ids?: string[] }) => {
      const ids = normalizeIds(payload?.ids);
      if (!ids.length) return { committed: false };
      return { committed: await deleteJournal.commit(ids) };
    },
  );

  registerMessageHandler("myz:listPendingDeletes", async () => ({
    ids: await deleteJournal.pendingIds(),
  }));
}
