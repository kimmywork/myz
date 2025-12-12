import { computed, defineComponent, ref } from "vue";
import { RECORD_KINDS, getRecordKind } from "../../shared/types.js";
import { useDashboardStore } from "../store/useDashboardStore.js";

export default defineComponent({
  name: "HighlightListRow",
  props: {
    record: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const store = useDashboardStore();
    const kind = computed(() => getRecordKind(props.record));
    const hasNote = computed(() => Boolean(props.record?.note));
    const shouldSplitLayout = computed(() => hasNote.value);
    const tags = computed(() => props.record?.tags || []);
    const MAX_VISIBLE_TAGS = 5;
    const showAllTags = ref(false);

    const visibleTags = computed(() => {
      if (showAllTags.value) {
        return tags.value;
      }
      return tags.value.slice(0, MAX_VISIBLE_TAGS);
    });

    const hiddenTagsCount = computed(() => {
      return Math.max(0, tags.value.length - MAX_VISIBLE_TAGS);
    });

    function toggleTags() {
      showAllTags.value = !showAllTags.value;
    }

    const archiveLink = computed(() => {
      const record = props.record || {};
      return record.archiveSnapshotUrl || record.archiveUrl || "";
    });

    function handleAction(action) {
      const id = props.record?.id;
      if (!id) {
        return;
      }
      switch (action) {
        case "copy":
          store.copyHighlight(id);
          break;
        case "delete":
          store.deleteHighlight(id);
          break;
        case "view":
          store.openModal(id, "view");
          break;
        case "edit":
          store.openModal(id, "edit");
          break;
        case "downgrade":
          store.downgradeHighlight(id);
          break;
        default:
          break;
      }
    }

    return () => {
      const record = props.record;
      if (!record) {
        return null;
      }
      const rowClasses = [
        "rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-800 shadow-sm dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
      ];
      if (kind.value === RECORD_KINDS.CLIP) {
        rowClasses.push("border-teal-200 dark:border-cyan-500/30");
      }
      return (
        <div
          class={rowClasses.join(" ")}
          data-id={record.id}
          data-kind={kind.value}
        >
          {/* 顶部：元信息 */}
          <div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span
              class={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                kind.value === RECORD_KINDS.AI_GENERATED
                  ? "bg-fuchsia-500 text-white"
                  : kind.value === RECORD_KINDS.CLIP
                    ? "bg-teal-500 text-white"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
              ].join(" ")}
            >
              {kind.value === RECORD_KINDS.CLIP ? "保存文字" : "划线标注"}
            </span>
            <span
              class="max-w-[120px] truncate font-semibold text-slate-600 dark:text-slate-200"
              title={record.hostname || record.url || ""}
              innerHTML={store.formatInline(
                (record.hostname || record.url || "").substring(0, 20) +
                  ((record.hostname || record.url || "").length > 20
                    ? "..."
                    : ""),
              )}
            ></span>
            <span class="text-slate-400 dark:text-slate-500">
              {store.formatDateTime(record.createdAt)}
            </span>
          </div>

          {/* 第二行：标签 */}
          {visibleTags.value.length > 0 && (
            <div class="mb-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              {visibleTags.value.map((tag) => (
                <span
                  key={tag}
                  class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                  innerHTML={store.formatInline(tag)}
                ></span>
              ))}
              {hiddenTagsCount.value > 0 && (
                <button
                  type="button"
                  class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
                  onClick={toggleTags}
                >
                  +{hiddenTagsCount.value} 个标签
                </button>
              )}
            </div>
          )}

          {/* 内容区域和操作按钮 */}
          <div class="grid grid-cols-[1fr_auto] gap-6">
            {/* 内容区域 */}
            <div class="min-h-0">
              {shouldSplitLayout.value ? (
                <div class="grid gap-4 md:grid-cols-2">
                  <div
                    class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70"
                    innerHTML={store.renderHighlight(record)}
                  ></div>
                  <div
                    class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 dark:text-slate-200"
                    innerHTML={store.formatNote(record.note)}
                  ></div>
                </div>
              ) : (
                <div
                  class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70"
                  innerHTML={store.renderHighlight(record)}
                ></div>
              )}
            </div>

            {/* 操作按钮 */}
            <div class="flex flex-col gap-2 text-xs font-semibold">
              {archiveLink.value ? (
                <a
                  class="whitespace-nowrap text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                  href={archiveLink.value}
                  target="_blank"
                  rel="noopener"
                  title="存档"
                >
                  存档
                </a>
              ) : null}
              <a
                class="whitespace-nowrap text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                href={record.sourceUrl || record.url}
                target="_blank"
                rel="noopener"
                title={record.title || record.url}
              >
                页面
              </a>
              <button
                class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                type="button"
                onClick={() => handleAction("view")}
              >
                查看
              </button>
              <button
                class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                type="button"
                onClick={() => handleAction("edit")}
              >
                编辑
              </button>
              <button
                class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                type="button"
                onClick={() => handleAction("copy")}
              >
                复制
              </button>
              {kind.value === RECORD_KINDS.HIGHLIGHT && (
                <button
                  class="whitespace-nowrap text-left text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  type="button"
                  onClick={() => handleAction("downgrade")}
                >
                  降级
                </button>
              )}
              <button
                class="whitespace-nowrap text-left text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                type="button"
                onClick={() => handleAction("delete")}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      );
    };
  },
});
