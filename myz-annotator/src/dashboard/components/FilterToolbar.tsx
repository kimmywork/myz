import { defineComponent, ref, Ref } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import TagInput from "./TagInput.jsx";
import { IconCalendar } from "@/shared/icons.js";

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
        class="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
        aria-label="筛选工具"
      >
        <div class="flex flex-col gap-6">
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>关键词</span>
              <input
                type="search"
                placeholder="搜索文本、批注或标签"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={uiStore.filters.search}
                onInput={(event: InputEvent) =>
                  uiStore.setFilter(
                    "search",
                    (event.target as HTMLInputElement).value,
                  )
                }
              />
            </label>
            <label class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>网站</span>
              <select
                data-testid="site-filter"
                class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-white"
                value={uiStore.filters.site}
                onChange={(event: Event) =>
                  uiStore.setFilter(
                    "site",
                    (event.target as HTMLSelectElement).value,
                  )
                }
              >
                <option value="">全部网站</option>
                {highlightsStore.availableSites.map((site: string) => (
                  <option key={site} value={site}>
                    {site}
                  </option>
                ))}
              </select>
            </label>
            <label class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>标签</span>
              <TagInput
                modelValue={uiStore.filters.tags}
                options={highlightsStore.availableTags}
                placeholder="输入后按回车或逗号确认"
                allowNew={false}
                onUpdate:modelValue={(value) => uiStore.setFilter("tags", value)}
              />
            </label>
          </div>
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>开始日期</span>
              <div class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                <input
                  ref={fromRef}
                  type="date"
                  class="w-full appearance-none bg-transparent text-sm text-slate-800 outline-none dark:text-white"
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
                  class="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300"
                  aria-label="打开开始日期选择器"
                  onClick={() => handlePicker(fromRef)}
                >
                  <IconCalendar size={16} aria-hidden="true" />
                </button>
              </div>
            </label>
            <label class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>结束日期</span>
              <div class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                <input
                  ref={toRef}
                  type="date"
                  class="w-full appearance-none bg-transparent text-sm text-slate-800 outline-none dark:text-white"
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
                  class="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300"
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
                class="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-200"
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
