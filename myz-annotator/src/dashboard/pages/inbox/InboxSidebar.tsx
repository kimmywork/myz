import { Tag } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { TAG_DISPLAY_CAP, TABS } from "./inbox-types.js";
import type { InboxApi } from "./useInboxQueue.js";

/** Queue tabs + draggable tag filter panel. */
export default defineComponent({
  name: "InboxSidebar",
  props: {
    api: { type: Object as PropType<InboxApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      return (
        <aside class="flex w-full flex-col gap-4 min-[900px]:w-60 min-[900px]:shrink-0">
          <div class="rounded-panel border border-line bg-surface p-3 dark:border-line">
            <div class="mb-2 text-tag font-semibold uppercase tracking-wide text-muted">
              队列
            </div>
            <nav class="space-y-1">
              {TABS.map((tab) => {
                const active = a.activeTab.value === tab.key;
                const count = a.queue.value?.counts[tab.key] ?? 0;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      a.activeTab.value = tab.key;
                      a.selected.value = new Set();
                      a.sidebarOpen.value = false;
                    }}
                    class={[
                      "flex w-full items-center justify-between rounded-control px-3 py-2 text-compact font-medium transition",
                      active
                        ? "bg-surface-2 text-accent-text"
                        : "text-muted hover:bg-surface-2",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{tab.label}</span>
                    <span class="text-caption text-muted">{count}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div class="rounded-panel border border-line bg-surface p-3 dark:border-line">
            <div class="mb-2 flex items-center gap-1 text-tag font-semibold uppercase tracking-wide text-muted">
              <Tag size={12} /> 标签
            </div>
            <p class="mb-2 text-caption text-muted">
              把记录拖到标签，或把标签拖到记录上
            </p>
            <input
              type="search"
              placeholder="筛选标签"
              value={a.tagQuery.value}
              onInput={(event: Event) =>
                (a.tagQuery.value = (event.target as HTMLInputElement).value)
              }
              class="mb-2 h-8 w-full rounded-control border border-line bg-surface px-2 text-caption text-text"
            />
            <div class="flex flex-wrap gap-1">
              {a.visibleTags.value.length === 0 ? (
                <span class="text-caption text-muted">
                  {a.tagCounts.value.length === 0 ? "暂无标签" : "没有匹配标签"}
                </span>
              ) : (
                a.visibleTags.value.map(({ tag, count }) => {
                  const active = a.activeTag.value === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      data-testid="inbox-tag"
                      draggable
                      onDragstart={(event: DragEvent) =>
                        a.startTagDrag(tag, event)
                      }
                      onDragend={a.endDrag}
                      onClick={() => {
                        a.activeTag.value = active ? null : tag;
                        a.sidebarOpen.value = false;
                      }}
                      onDragover={(event: DragEvent) => event.preventDefault()}
                      onDrop={(event: DragEvent) => a.onDropOnTag(event, tag)}
                      class={[
                        "rounded-tag border px-2 py-0.5 text-tag transition",
                        active
                          ? "border-accent bg-surface-2 text-accent-text"
                          : "border-line text-muted hover:border-accent hover:text-accent-text",
                      ].join(" ")}
                    >
                      {tag}
                      {count ? ` ${count}` : ""}
                    </button>
                  );
                })
              )}
            </div>
            {!a.tagQuery.value.trim() &&
            a.tagCounts.value.length > TAG_DISPLAY_CAP ? (
              <button
                class="btn btn-small mt-2"
                type="button"
                onClick={() => (a.showAllTags.value = !a.showAllTags.value)}
              >
                {a.showAllTags.value
                  ? "收起标签"
                  : `显示全部 ${a.tagCounts.value.length} 个标签`}
              </button>
            ) : null}
          </div>
        </aside>
      );
    };
  },
});
