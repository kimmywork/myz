import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";

/** The parts of the library view that change *which* records are in sight. */
export interface LibraryViewState {
  quickSearch: string;
  search: string;
  site: string;
  tags: readonly string[];
  from: string;
  to: string;
  pageFilter: string;
}

/**
 * Identity of the current library view. Filters, search and the page filter
 * belong here; cards↔list does not — it only repaints the same records.
 */
export function libraryViewKey(state: LibraryViewState): string {
  return JSON.stringify([
    state.quickSearch,
    state.search,
    state.site,
    state.tags,
    state.from,
    state.to,
    state.pageFilter,
  ]);
}

export interface LibrarySelection {
  selectedIds: Ref<Set<string>>;
  count: ComputedRef<number>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  isAllSelected: (visibleIds: readonly string[]) => boolean;
  toggleAll: (visibleIds: readonly string[]) => void;
  prune: (existingIds: ReadonlySet<string>) => void;
  /** Clears everything, or only `ids` when a batch owns that subset. */
  clear: (ids?: readonly string[]) => void;
}

/**
 * Batch selection for the library (§4.31). The selection belongs to the view,
 * not to the app: it lives in the page instance (unmounting clears it), and any
 * change to `viewKey` — filters, search, page filter — clears it as well.
 *
 * Cards↔list is deliberately *not* part of `viewKey`: it only changes how the
 * same records are painted, so the selection must survive it.
 */
export function useLibrarySelection(
  viewKey: Ref<string> | ComputedRef<string>,
): LibrarySelection {
  const selectedIds = ref<Set<string>>(new Set());

  watch(viewKey, () => {
    selectedIds.value = new Set();
  });

  const count = computed(() => selectedIds.value.size);

  function has(id: string): boolean {
    return selectedIds.value.has(id);
  }

  function toggle(id: string) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  function isAllSelected(visibleIds: readonly string[]): boolean {
    return (
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.value.has(id))
    );
  }

  /** "Select all" only covers the rendered page, never the whole view. */
  function toggleAll(visibleIds: readonly string[]) {
    const next = new Set(selectedIds.value);
    if (isAllSelected(visibleIds)) {
      visibleIds.forEach((id) => next.delete(id));
    } else {
      visibleIds.forEach((id) => next.add(id));
    }
    selectedIds.value = next;
  }

  /** Drop ids that no longer exist (record deleted in another surface). */
  function prune(existingIds: ReadonlySet<string>) {
    const next = new Set<string>();
    selectedIds.value.forEach((id) => {
      if (existingIds.has(id)) next.add(id);
    });
    if (next.size !== selectedIds.value.size) selectedIds.value = next;
  }

  function clear(ids?: readonly string[]) {
    if (!ids) {
      selectedIds.value = new Set();
      return;
    }
    // A batch may finish after the user picked new rows: only drop the rows it
    // actually operated on.
    const next = new Set(selectedIds.value);
    ids.forEach((id) => next.delete(id));
    selectedIds.value = next;
  }

  return {
    selectedIds,
    count,
    has,
    toggle,
    isAllSelected,
    toggleAll,
    prune,
    clear,
  };
}
