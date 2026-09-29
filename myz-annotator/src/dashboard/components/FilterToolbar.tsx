import { SelectInput, TagInput } from "@myz/dashboard-ui";
import { IconCalendar } from "@myz/shared/icons";
import { defineComponent, ref, Ref } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "FilterToolbar",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const fromRef: Ref<HTMLInputElement | null> = ref(null);
    const toRef: Ref<HTMLInputElement | null> = ref(null);

    function handlePicker(refTarget?: Ref<HTMLInputElement | null>) {
      const input = refTarget?.value;
      if (input && typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
      input?.focus();
    }

    return () => (
      <section
        class="rounded-panel border border-line bg-surface p-5 dark:border-line dark:bg-surface"
        aria-label="筛选工具"
      >
        <div class="flex flex-col gap-6">
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="flex flex-col gap-2 text-compact text-muted">
              <span>关键词</span>
              <input
                type="search"
                placeholder="搜索文本、批注或标签"
                class="rounded-control border border-line bg-surface px-3 py-2 text-compact text-text placeholder:text-muted focus:border-accent focus:outline-none dark:border-line dark:bg-surface-2 dark:text-text dark:placeholder:text-muted"
                value={uiStore.filters.search}
                onInput={(event: InputEvent) =>
                  uiStore.setFilter(
                    "search",
                    (event.target as HTMLInputElement).value,
                  )
                }
              />
            </label>
            <label class="flex flex-col gap-2 text-compact text-muted">
              <span>网站</span>
              <SelectInput
                testId="site-filter"
                modelValue={uiStore.filters.site}
                options={[
                  { value: "", label: "全部网站" },
                  ...highlightsStore.availableSites.map((site: string) => ({
                    value: site,
                    label: site,
                  })),
                ]}
                onChange={(value) => uiStore.setFilter("site", value)}
              />
            </label>
            <label class="flex flex-col gap-2 text-compact text-muted">
              <span>标签</span>
              <TagInput
                modelValue={uiStore.filters.tags}
                options={highlightsStore.availableTags}
                placeholder="输入后按回车确认"
                allowNew={false}
                onUpdate:modelValue={(value) =>
                  uiStore.setFilter("tags", value)
                }
              />
            </label>
          </div>
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="flex flex-col gap-2 text-compact text-muted">
              <span>开始日期</span>
              <div class="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 dark:border-line dark:bg-surface-2">
                <input
                  ref={fromRef}
                  type="date"
                  class="w-full appearance-none bg-transparent text-compact text-text outline-none dark:text-text"
                  value={uiStore.filters.from}
                  onInput={(event: InputEvent) =>
                    uiStore.setFilter(
                      "from",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
                <button
                  type="button"
                  class="rounded-full border border-line p-2 text-muted transition hover:border-accent hover:text-accent-text dark:border-line dark:text-muted dark:hover:text-accent-text"
                  aria-label="打开开始日期选择器"
                  onClick={() => handlePicker(fromRef)}
                >
                  <IconCalendar size={16} aria-hidden="true" />
                </button>
              </div>
            </label>
            <label class="flex flex-col gap-2 text-compact text-muted">
              <span>结束日期</span>
              <div class="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 dark:border-line dark:bg-surface-2">
                <input
                  ref={toRef}
                  type="date"
                  class="w-full appearance-none bg-transparent text-compact text-text outline-none dark:text-text"
                  value={uiStore.filters.to}
                  onInput={(event: InputEvent) =>
                    uiStore.setFilter(
                      "to",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
                <button
                  type="button"
                  class="rounded-full border border-line p-2 text-muted transition hover:border-accent hover:text-accent-text dark:border-line dark:text-muted dark:hover:text-accent-text"
                  aria-label="打开结束日期选择器"
                  onClick={() => handlePicker(toRef)}
                >
                  <IconCalendar size={16} aria-hidden="true" />
                </button>
              </div>
            </label>
            <div class="flex flex-col justify-end">
              <button
                type="button"
                class="rounded-control border border-line px-4 py-2 text-compact font-semibold text-text transition hover:border-accent hover:text-accent-text dark:border-line dark:text-text"
                onClick={uiStore.resetFilters}
              >
                重置筛选
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  },
});
