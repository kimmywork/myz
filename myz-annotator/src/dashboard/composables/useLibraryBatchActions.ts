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
 */
export function useLibraryBatchActions(input: {
  selectedRecords: ComputedRef<MyZRecord[]>;
  clearSelection: () => void;
}) {
  const highlightsStore = useHighlightsStore();
  const deleteStore = useDeleteStore();
  const bulkTag = ref("");
  const bulkExportFormat = ref<"json" | "markdown">("json");

  /** Adds one tag to each record that does not have it yet. */
  async function addTagToRecords(
    records: readonly MyZRecord[],
    tag: string,
  ): Promise<number> {
    let applied = 0;
    for (const record of records) {
      const tags = record.tags || [];
      if (tags.includes(tag)) continue;
      await invoke("myz:updateHighlight", {
        id: record.id,
        tags: [...tags, tag],
      });
      applied += 1;
    }
    if (applied) await highlightsStore.loadHighlights();
    return applied;
  }

  async function applyBulkTag() {
    const tag = bulkTag.value.trim();
    const records = input.selectedRecords.value;
    if (!tag || !records.length) return;
    const applied = await addTagToRecords(records, tag);
    highlightsStore.setOperationStatus(
      applied
        ? `已为 ${applied} 条加上标签「${tag}」`
        : `这些记录已经有标签「${tag}」`,
    );
    bulkTag.value = "";
    input.clearSelection();
  }

  async function exportSelected() {
    const records = input.selectedRecords.value;
    if (!records.length) return;
    await highlightsStore.handleExport(
      bulkExportFormat.value,
      records.map((record) => record.id),
    );
    highlightsStore.setOperationStatus(`已导出 ${records.length} 条`, 2000);
  }

  /** One group, one undo bar: the whole batch is undone by one click. */
  function deleteSelected() {
    const records = input.selectedRecords.value;
    if (!records.length) return;
    deleteStore.requestDelete(records, {
      reload: () => highlightsStore.refreshHighlights(),
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
