import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "@myz/core/delete-session";
import type { DeleteSession } from "@myz/core/delete-session";
import { invoke } from "@/messaging/invoke";

/** Callbacks a host supplies; the journal ports are wired here once. */
export interface JournalDeleteCallbacks<T> {
  restore: (items: readonly T[]) => void;
  onCommitted?: (ids: readonly string[]) => void;
  onCommitFailed?: (items: readonly T[]) => void;
  onUndone?: (items: readonly T[]) => void;
  windowMs?: number;
}

/**
 * Delete session whose intent persistence and commit run through the
 * background journal (§4.30). Shared by the dashboard, the readers and the
 * content inspector so the message plumbing exists once.
 */
export function createJournalDeleteSession<T extends { id: string }>(
  callbacks: JournalDeleteCallbacks<T>,
): DeleteSession<T> {
  return createDeleteSession<T>({
    getId: (item) => item.id,
    windowMs: callbacks.windowMs ?? DELETE_UNDO_WINDOW_MS,
    queue: async (ids, dueAt) =>
      (await invoke("myz:queuePendingDelete", { ids: [...ids], dueAt })).ok,
    commit: async (ids) =>
      (await invoke("myz:commitPendingDelete", { ids: [...ids] })).committed,
    cancel: async (ids) => {
      const result = await invoke("myz:cancelPendingDelete", {
        ids: [...ids],
      });
      return result.ok;
    },
    restore: callbacks.restore,
    onCommitted: callbacks.onCommitted,
    onCommitFailed: callbacks.onCommitFailed,
    onUndone: callbacks.onUndone,
  });
}
