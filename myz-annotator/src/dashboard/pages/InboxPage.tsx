import { IconSearch } from "@myz/shared/icons";
import { formatDateTime } from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import InboxList from "./inbox/InboxList.jsx";
import InboxSidebar from "./inbox/InboxSidebar.jsx";
import { useInboxQueue } from "./inbox/useInboxQueue.js";

export default defineComponent({
  name: "InboxPage",
  setup() {
    const a = useInboxQueue();
    return () => (
      <section class="space-y-4">
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-heading font-semibold text-text">Inbox</h2>
            <p class="text-caption text-muted">
              待处理 {a.queue.value?.counts.pending ?? 0} 条
              {a.queue.value?.oldestPendingAt
                ? ` · 最早积压 ${formatDateTime(a.queue.value.oldestPendingAt)}`
                : ""}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn min-[900px]:hidden"
              type="button"
              onClick={() => (a.sidebarOpen.value = !a.sidebarOpen.value)}
            >
              筛选 / 标签
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => {
                a.focusMode.value = !a.focusMode.value;
                a.focusIndex.value = 0;
              }}
            >
              {a.focusMode.value ? "退出专注" : "专注处理"}
            </button>
          </div>
        </header>

        <div class="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start">
          <div
            class={[
              a.sidebarOpen.value ? "block" : "hidden",
              "min-[900px]:block",
            ].join(" ")}
          >
            <InboxSidebar api={a} />
          </div>

          <div class="min-w-0 flex-1 space-y-3">
            <div class="relative min-w-0">
              <IconSearch
                size={16}
                class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                placeholder="搜索原文、批注、标题、标签、来源"
                value={a.query.value}
                onInput={(event: Event) =>
                  (a.query.value = (event.target as HTMLInputElement).value)
                }
                class="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-3 text-compact text-text"
              />
            </div>
            <datalist id="inbox-tag-options">
              {a.allTags.value.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>

            {a.activeTag.value ? (
              <p class="text-caption text-muted">
                已筛选标签「{a.activeTag.value}」·
                <button
                  class="btn-link"
                  type="button"
                  onClick={() => (a.activeTag.value = null)}
                >
                  清除
                </button>
              </p>
            ) : null}

            {a.selected.value.size > 0 ? (
              <div class="flex flex-wrap gap-2 rounded-control border border-line bg-surface-2 p-2">
                <span class="text-caption text-muted">
                  已选 {a.selected.value.size}
                </span>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => a.batchStatus("kept", "已保留")}
                >
                  批量保留
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => a.batchStatus("archived", "已归档")}
                >
                  批量归档
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => a.batchStatus("snoozed", "已稍后")}
                >
                  批量稍后
                </button>
                <button
                  class="btn btn-small btn-danger"
                  type="button"
                  onClick={() => void a.batchDelete()}
                >
                  批量删除
                </button>
              </div>
            ) : null}

            {a.undo.value ? (
              <div
                class="flex items-center gap-2 text-caption"
                role="status"
                aria-live="polite"
              >
                <span>{a.undo.value.label}</span>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void a.revertUndo()}
                >
                  撤销
                </button>
              </div>
            ) : null}

            {a.status.value ? (
              <p
                class="text-caption text-muted"
                role="status"
                aria-live="polite"
              >
                {a.status.value}
              </p>
            ) : null}

            <InboxList api={a} />
          </div>
        </div>
      </section>
    );
  },
});
