import { isHighlightRecord } from "@myz/shared/highlightUtils";
import type { MyZRecord } from "@myz/shared/types";
import { decorateHighlightElement } from "../apply-highlight.ts";
import { useInspectorStore } from "../stores/inspector-store.ts";
import { useModalStore } from "../stores/modal-store.ts";
import { removeHighlightFromDom } from "./apply.ts";
import { highlightCache, storeRecord, unreachableHighlights } from "./cache.ts";
import { updateHighlightIndicators } from "./indicators.ts";
import { removeHighlightFromPending } from "./reapply.ts";
import { invoke } from "@/messaging/invoke";

export async function updateExistingHighlight(update: Partial<MyZRecord>) {
  const modalStore = useModalStore();
  const inspectorStore = useInspectorStore();
  try {
    const record = await invoke("myz:updateHighlight", update);
    if (!record) return;
    const stored = storeRecord(record);
    if (!stored) return;
    modalStore.addModalKnownTags(stored.tags || []);
    if (isHighlightRecord(stored)) {
      const nodes = document.querySelectorAll(
        `[data-highlight-id="${stored.id}"]`,
      );
      nodes.forEach((node) =>
        decorateHighlightElement(node as HTMLElement, stored),
      );
    } else {
      removeHighlightFromDom(stored.id);
      unreachableHighlights.delete(stored.id);
      removeHighlightFromPending(stored.id);
    }
    if (inspectorStore.isInspecting(stored.id)) {
      inspectorStore.showRecord(stored);
    }
    updateHighlightIndicators();
  } catch (error) {
    console.error("Failed to update highlight", error);
  }
}

/**
 * Deletes a highlight from storage and the live DOM.
 * Resolves `false` (instead of throwing) when the storage write failed, so
 * deferred-delete callers can restore the record and tell the user.
 */
export async function deleteHighlight(id: string): Promise<boolean> {
  const inspectorStore = useInspectorStore();
  try {
    await invoke("myz:removeHighlight", { id });
    highlightCache.delete(id);
    removeHighlightFromPending(id);
    unreachableHighlights.delete(id);
    removeHighlightFromDom(id);
    if (inspectorStore.isInspecting(id)) inspectorStore.hide();
    updateHighlightIndicators();
    return true;
  } catch (error) {
    console.error("Failed to delete highlight", error);
    return false;
  }
}

export function focusHighlight(id?: string) {
  if (!id) return false;
  const node = document.querySelector(`[data-highlight-id="${id}"]`);
  if (!node) return false;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("myz-highlight--flash");
  setTimeout(() => node.classList.remove("myz-highlight--flash"), 1200);
  return true;
}
