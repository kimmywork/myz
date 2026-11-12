// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computed, nextTick, ref } from "vue";
import {
  libraryViewKey,
  useLibrarySelection,
} from "@/dashboard/composables/useLibrarySelection";

const baseView = {
  quickSearch: "",
  search: "",
  site: "",
  tags: [] as string[],
  from: "",
  to: "",
  pageFilter: "",
};

describe("useLibrarySelection", () => {
  it("clears the selection when filters or search change", async () => {
    const search = ref("");
    const viewKey = computed(() =>
      libraryViewKey({ ...baseView, search: search.value }),
    );
    const selection = useLibrarySelection(viewKey);
    selection.toggle("a");
    selection.toggle("b");
    expect(selection.count.value).toBe(2);

    search.value = "foo";
    await nextTick();
    expect(selection.count.value).toBe(0);
  });

  it("clears the selection when the page filter changes", async () => {
    const pageFilter = ref("");
    const viewKey = computed(() =>
      libraryViewKey({ ...baseView, pageFilter: pageFilter.value }),
    );
    const selection = useLibrarySelection(viewKey);
    selection.toggle("a");

    pageFilter.value = "https://example.com/a";
    await nextTick();
    expect(selection.count.value).toBe(0);
  });

  it("keeps the selection when only more rows load", async () => {
    const viewKey = computed(() => libraryViewKey(baseView));
    const rendered = ref(2);
    const selection = useLibrarySelection(viewKey);
    selection.toggle("a");

    rendered.value = 4; // load more: more rows painted, same view
    await nextTick();
    expect(selection.has("a")).toBe(true);
  });

  it("keeps the selection when cards/list changes", async () => {
    const viewMode = ref<"cards" | "list">("cards");
    // Cards↔list is not part of the view key on purpose.
    const viewKey = computed(() => libraryViewKey(baseView));
    const selection = useLibrarySelection(viewKey);
    selection.toggle("a");

    viewMode.value = "list";
    await nextTick();
    expect(selection.has("a")).toBe(true);
  });

  it("select-all covers the visible page and toggles off", () => {
    const key = ref("view");
    const selection = useLibrarySelection(key);

    selection.toggleAll(["a", "b", "c"]);
    expect(selection.count.value).toBe(3);
    expect(selection.isAllSelected(["a", "b", "c"])).toBe(true);

    selection.toggleAll(["a", "b", "c"]);
    expect(selection.count.value).toBe(0);
  });

  it("prunes ids that no longer exist", () => {
    const key = ref("view");
    const selection = useLibrarySelection(key);
    selection.toggle("a");
    selection.toggle("b");

    selection.prune(new Set(["b"]));
    expect(selection.has("a")).toBe(false);
    expect(selection.has("b")).toBe(true);
  });
});
