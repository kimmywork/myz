import type { MyZRecord } from "@myz/shared/types";
import { ref } from "vue";
import type { ComputedRef } from "vue";
import { useDeleteStore } from "../stores/delete.js";
import { useHighlightsStore } from "../stores/highlights.js";
import { invoke } from "@/messaging/invoke.js";

/**
 * Batch actions for the library selection bar (§4.31): tag, export and the
 * I4 delete session. Kept out of the page component so it stays a thin render
 * surface and neither the page nor the store trips the size guardrail.
 *
 * Every action is guarded synchronously: a second click while the first
 * request is still in flight would otherwise build its payload from the same
 * stale records (tag A and tag B both replacing `tags`) or double-schedule the
 * same delete ids.
 */
export function useLibraryBatchActions(input: {
  selectedRecords: ComputedRef<MyZRecord[]>;
  clearSelection: () => void;
}) {
  const highlightsStore = useHighlightsStore();
  const deleteStore = useDeleteStore();
  const bulkTag = ref("");
  const bulkExportFormat = ref<"json" | "markdown">("json");
  /** Synchronous in-flight guards: one batch action at a time. */
  let tagging = false;
  let exporting = false;
  let deleting = false;

  /**
   * Adds one tag to each record that does not have it yet.
   *
   * A rejection part-way leaves the earlier records tagged, so the caller gets
   * the partial count back instead of an all-or-nothing answer; the records are
   * reloaded either way so the list shows what actually happened.
   */
  async function addTagToRecords(
    records: readonly MyZRecord[],
    tag: string,
  ): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;
    for (const record of records) {
      const tags = record.tags || [];
      if (tags.includes(tag)) continue;
      try {
        await invoke("myz:updateHighlight", {
          id: record.id,
          tags: [...tags, tag],
        });
        applied += 1;
      } catch {
        failed += 1;
      }
    }
    if (applied) await highlightsStore.loadHighlights();
    return { applied, failed };
  }

  async function applyBulkTag() {
    const tag = bulkTag.value.trim();
    const records = input.selectedRecords.value;
    if (!tag || !records.length || tagging) return;
    tagging = true;
    try {
      const { applied, failed } = await addTagToRecords(records, tag);
      if (failed) {
        // Partial batches must say so: the tag is on some rows already.
        highlightsStore.setOperationStatus(
          `部分完成：已为 ${applied} 条加上「${tag}」，${failed} 条失败`,
          5000,
        );
      } else {
        highlightsStore.setOperationStatus(
          applied
            ? `已为 ${applied} 条加上标签「${tag}」`
            : `这些记录已经有标签「${tag}」`,
        );
      }
      bulkTag.value = "";
      input.clearSelection();
    } finally {
      tagging = false;
    }
  }

  async function exportSelected() {
    const records = input.selectedRecords.value;
    if (!records.length || exporting) return;
    exporting = true;
    try {
      // `handleExport` reports failure itself; do not claim success on top.
      const ok = await highlightsStore.handleExport(
        bulkExportFormat.value,
        records.map((record) => record.id),
      );
      if (ok) {
        highlightsStore.setOperationStatus(`已导出 ${records.length} 条`, 2000);
      }
    } finally {
      exporting = false;
    }
  }

  /** One group, one undo bar: the whole batch is undone by one click. */
  function deleteSelected() {
    const records = input.selectedRecords.value;
    if (!records.length || deleting) return;
    deleting = true;
    void deleteStore
      .requestDelete(records, {
        reload: () => highlightsStore.refreshHighlights(),
      })
      .finally(() => {
        deleting = false;
      });
  }

  return {
    bulkTag,
    bulkExportFormat,
    applyBulkTag,
    exportSelected,
    deleteSelected,
  };
}
