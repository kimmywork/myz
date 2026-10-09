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
        return <StatePanel kind="loading" title="正在加载 Inbox…" />;
      }
      if (a.loadError.value) {
        return (
          <StatePanel
            kind="error"
            title="Inbox 加载失败"
            hint={a.loadError.value}
            actionLabel="重试"
            onAction={() => void a.load()}
          />
        );
      }
      if (a.focusMode.value) {
        return <InboxFocusView api={a} />;
      }
      return (
        <div class="grid gap-3">
          {a.visibleItems.value.map((item) => (
            <div key={item.targetId}>
              <InboxRow api={a} item={item} />
            </div>
          ))}
          {a.visibleCount.value < a.tabItems.value.length ? (
            <div ref={a.sentinelRef} class="h-1" aria-hidden="true" />
          ) : null}
          {a.tabItems.value.length === 0 ? (
            <p class="text-caption text-muted">没有匹配的记录</p>
          ) : null}
        </div>
      );
    };
  },
});
