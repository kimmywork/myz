import { hostnameForRecord } from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { excerpt } from "./inbox-utils.js";
import type { InboxApi } from "./useInboxQueue.js";

/** Single-item focus mode card with keyboard hints. */
export default defineComponent({
  name: "InboxFocusView",
  props: {
    api: { type: Object as PropType<InboxApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      const item = a.focusItem.value;
      return (
        <div
          data-testid="inbox-focus"
          draggable={Boolean(item)}
          onDragstart={(event: DragEvent) => {
            if (item) a.startRecordDrag(item, event);
          }}
          onDragend={a.endDrag}
          onDragover={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => {
            if (item) a.onDropOnRecord(event, item);
          }}
          class="rounded-panel border border-line bg-surface p-4"
        >
          {item ? (
            <>
              <div class="text-caption text-muted">
                {a.focusIndex.value + 1} / {a.tabItems.value.length}
              </div>
              <p
                class="mt-2 text-base"
                style="font-family: var(--myz-read); line-height: 1.55"
              >
                {excerpt(item.record.text || item.record.note, 400)}
              </p>
              <div class="mt-1 text-caption text-muted">
                {item.record.title || hostnameForRecord(item.record)}
              </div>
              <p class="mt-3 text-caption text-muted">
                快捷键：K 保留 · A 归档 · S 稍后 · D 删除 · M 标记 · Space
                下一条 · 1–9 打标签 · Esc 退出
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void a.runAction(item, "keep")}
                >
                  保留
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void a.runAction(item, "archive")}
                >
                  归档
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void a.runAction(item, "snooze")}
                >
                  稍后
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void a.runAction(item, "mark")}
                >
                  标记
                </button>
                <button
                  class="btn btn-small btn-danger"
                  type="button"
                  onClick={() => void a.runAction(item, "delete")}
                >
                  删除
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => a.advance()}
                >
                  下一条
                </button>
              </div>
            </>
          ) : (
            <p class="text-caption text-muted">队列已清空</p>
          )}
        </div>
      );
    };
  },
});
