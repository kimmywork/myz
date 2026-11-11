import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "@myz/core/delete-session";
import type { MyZRecord } from "@myz/shared/types";
import { ref } from "vue";
import { invoke } from "@/messaging/invoke";

interface ReaderDeleteOptions {
  /** Removes the record from the reader UI now. */
  removeUi: (record: MyZRecord) => void;
  /** Puts it back after undo or a failed commit. */
  restoreUi: (record: MyZRecord) => void;
}

/**
 * Delete flow for the PDF / EPUB readers (§4.30): queue the durable intent,
 * remove the mark locally, show a toast, commit after the window. Annotated
 * records are confirmed by the caller before this runs.
 */
export function useReaderDelete() {
  const message = ref("");
  let restoreUi: ((record: MyZRecord) => void) | null = null;

  const session = createDeleteSession<MyZRecord>({
    getId: (record) => record.id,
    windowMs: DELETE_UNDO_WINDOW_MS,
    queue: async (ids, dueAt) =>
      (await invoke("myz:queuePendingDelete", { ids: [...ids], dueAt })).ok,
    commit: async (ids) =>
      (await invoke("myz:commitPendingDelete", { ids: [...ids] })).committed,
    cancel: async (ids) => {
      await invoke("myz:cancelPendingDelete", { ids: [...ids] });
    },
    restore: (records) => {
      message.value = "";
      records.forEach((record) => restoreUi?.(record));
    },
    onCommitted: () => {
      message.value = "";
    },
    onCommitFailed: () => {
      message.value = "删除失败，划线没有删除";
    },
    onUndone: () => {
      message.value = "";
    },
  });

  async function remove(
    record: MyZRecord,
    options: ReaderDeleteOptions,
  ): Promise<boolean> {
    restoreUi = options.restoreUi;
    const queued = await session.schedule([record]);
    if (!queued) {
      message.value = "删除失败，划线没有删除";
      return false;
    }
    options.removeUi(record);
    message.value = "已删除划线";
    return true;
  }

  return {
    message,
    remove,
    undo: () => {
      void session.undo();
    },
    pause: () => session.pause(),
    resume: () => session.resume(),
    dispose: () => session.dispose(),
  };
}
