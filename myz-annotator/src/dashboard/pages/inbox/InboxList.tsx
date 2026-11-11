import { StatePanel } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import InboxFocusView from "./InboxFocusView.jsx";
import InboxRow from "./InboxRow.jsx";
import type { InboxApi } from "./useInboxQueue.js";

/** Loading / error / focus / list switch for the middle column. */
export default defineComponent({
  name: "InboxList",
  props: {
    api: { type: Object as PropType<InboxApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      if (a.loading.value) {
        return (
          <div
            class="overflow-hidden rounded-panel border border-line bg-surface"
            data-testid="inbox-list-skeleton"
            aria-hidden="true"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                class="flex h-14 items-center gap-3 border-b border-line px-[var(--myz-row-pad-x)] last:border-b-0"
              >
                <div class="h-4 w-4 animate-pulse rounded-tag bg-skeleton" />
                <div class="flex-1 space-y-1.5">
                  <div class="h-3 w-[60%] animate-pulse rounded-tag bg-skeleton" />
                  <div class="h-2.5 w-[35%] animate-pulse rounded-tag bg-skeleton" />
                </div>
              </div>
            ))}
          </div>
        );
      }
      if (a.loadError.value) {
        return (
          <div
            class="flex flex-wrap items-center gap-2 rounded-panel border border-error-border bg-error-bg px-3 py-2 text-compact text-error"
            role="alert"
          >
            <span class="min-w-0 flex-1">
              Inbox 加载失败：{a.loadError.value}
            </span>
            <button
              class="btn h-7 rounded-control px-2 text-caption"
              type="button"
              onClick={() => void a.load()}
            >
              重试
            </button>
          </div>
        );
      }
      if (a.focusMode.value) {
        return <InboxFocusView api={a} />;
      }
      return (
        <div
          class="overflow-hidden rounded-panel border border-line bg-surface"
          data-testid="inbox-list"
          role="list"
          aria-label="Inbox 队列"
        >
          {a.visibleItems.value.map((item) => (
            <InboxRow key={item.targetId} api={a} item={item} />
          ))}
          {a.visibleCount.value < a.tabItems.value.length ? (
            <div ref={a.sentinelRef} class="h-1" aria-hidden="true" />
          ) : null}
          {a.tabItems.value.length === 0 ? (
            <div class="p-6">
              <StatePanel
                kind="empty"
                title="队列里没有记录"
                hint="在网页上选中文字就能划线；新采集的内容会先进入待处理"
                class="border-0 bg-transparent"
              />
            </div>
          ) : null}
        </div>
      );
    };
  },
});
