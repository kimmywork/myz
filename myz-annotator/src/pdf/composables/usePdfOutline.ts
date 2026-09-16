import { computed } from "vue";
import {
  loadOutline,
  type PdfDocument,
  type PdfOutlineEntry,
} from "../pdf-document.js";
import type { ReaderState } from "../stores/state.js";

export interface OutlineDeps {
  goToPage: (target: number) => Promise<void>;
  getDoc: () => PdfDocument | null;
}

function flattenOutline(entries: PdfOutlineEntry[]): PdfOutlineEntry[] {
  return entries.flatMap((entry) => [entry, ...flattenOutline(entry.children)]);
}

/** PDF table-of-contents state and navigation. */
export function usePdfOutline(state: ReaderState, deps: OutlineDeps) {
  const outlineCount = computed(
    () => flattenOutline(state.outline.value).length,
  );

  const currentOutlineId = computed<string | null>(() => {
    let best: PdfOutlineEntry | null = null;
    for (const entry of flattenOutline(state.outline.value)) {
      if (!entry.pageNumber || entry.pageNumber > state.page.value) {
        continue;
      }
      if (!best || entry.pageNumber >= (best.pageNumber ?? 0)) {
        best = entry;
      }
    }
    return best?.id ?? null;
  });

  /** Loads (and resolves) the outline for a document, guarding stale results. */
  function loadFor(doc: PdfDocument) {
    state.outline.value = [];
    state.expandedOutline.value = new Set();
    state.outlineStatus.value = "loading";
    void loadOutline(doc)
      .then((entries) => {
        if (deps.getDoc() !== doc) {
          return;
        }
        state.outline.value = entries;
        state.expandedOutline.value = new Set(entries.map((entry) => entry.id));
        state.outlineStatus.value = "ready";
      })
      .catch(() => {
        if (deps.getDoc() === doc) {
          state.outlineStatus.value = "error";
        }
      });
  }

  function toggleOutline(id: string) {
    const next = new Set(state.expandedOutline.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    state.expandedOutline.value = next;
  }

  async function goToOutline(entry: PdfOutlineEntry) {
    if (!entry.pageNumber) {
      return;
    }
    await deps.goToPage(entry.pageNumber);
  }

  return {
    outlineCount,
    currentOutlineId,
    loadFor,
    toggleOutline,
    goToOutline,
  };
}
