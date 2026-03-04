import { computed, defineComponent, ref } from "vue";
import { useRouter } from "vue-router";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { HighlightItemAction } from "./HighlightCard.jsx";
import { formatDateTime } from "@/dashboard/utils/records.js";
import { MyZRecord, RECORD_KINDS, getRecordKind } from "@/shared/types.js";
import { isRecord } from "@/shared/typeUtils";

export default defineComponent({
  name: "HighlightListRow",
  props: {
    record: {
      type: Object as () => MyZRecord | undefined,
      required: true,
      default: () => ({}),
    },
  },
  setup(props: { record: MyZRecord }) {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const router = useRouter();
    const kind = computed(() => getRecordKind(props.record));
    const isSocial = computed(() => {
      const value = String(kind.value);
      return value.startsWith("tweet:") || value.startsWith("toot:");
    });
    const socialKinds = computed(() => {
      const legacy =
        isRecord(props.record) && Array.isArray(props.record.tweetKinds)
          ? props.record.tweetKinds
          : undefined;
      const raw = props.record?.socialKinds || legacy;
      if (Array.isArray(raw)) {
        const normalized = raw
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(
            (item): item is RECORD_KINDS =>
              Boolean(item) &&
              Object.values(RECORD_KINDS).includes(item as RECORD_KINDS),
          );
        if (normalized.length) return normalized;
      }
      return isSocial.value ? [String(kind.value)] : [];
    });
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

    function handleAction(action: HighlightItemAction) {
      const id = props.record?.id;
      if (!id) {
        return;
      }
      switch (action) {
        case "copy":
          highlightsStore.copyHighlight(id);
          break;
        case "delete":
          highlightsStore.deleteHighlight(id);
          break;
        case "view":
          router.push(`/highlights/${id}`);
          break;
        case "edit":
          uiStore.openModal(id, "edit");
          break;
        case "downgrade":
          highlightsStore.downgradeHighlight(id);
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
      if (kind.value === RECORD_KINDS.AI_GENERATED) {
        rowClasses.push("border-fuchsia-200 dark:border-fuchsia-500/40");
      }
      if (isSocial.value) {
        rowClasses.push("border-sky-200 dark:border-sky-500/30");
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
                    : isSocial.value
                      ? "bg-sky-500 text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
              ].join(" ")}
            >
              {(() => {
                if (kind.value === RECORD_KINDS.CLIP) return "保存文字";
                if (kind.value === RECORD_KINDS.BOOKMARK) return "网页书签";
                if (kind.value === RECORD_KINDS.AI_GENERATED) return "AI摘录";
                if (kind.value === RECORD_KINDS.TWEET_POST) return "推文";
                if (kind.value === RECORD_KINDS.TWEET_REPLY) return "回复";
                if (kind.value === RECORD_KINDS.TWEET_RETWEET) return "转推";
                if (kind.value === RECORD_KINDS.TWEET_FAVORITE)
                  return "点赞推文";
                if (kind.value === RECORD_KINDS.TWEET_BOOKMARK)
                  return "书签推文";
                if (kind.value === RECORD_KINDS.TOOT_POST) return "嘟文";
                if (kind.value === RECORD_KINDS.TOOT_REPLY) return "回复";
                if (kind.value === RECORD_KINDS.TOOT_BOOST) return "转嘟";
                if (kind.value === RECORD_KINDS.TOOT_FAVORITE)
                  return "点赞嘟文";
                if (kind.value === RECORD_KINDS.TOOT_BOOKMARK)
                  return "书签嘟文";
                return "划线标注";
              })()}
            </span>
            <span
              class="max-w-[120px] truncate font-semibold text-slate-600 dark:text-slate-200"
              title={record.hostname || record.url || ""}
              innerHTML={uiStore.formatInline(
                (record.hostname || record.url || "").substring(0, 20) +
                  ((record.hostname || record.url || "").length > 20
                    ? "..."
                    : ""),
              )}
            ></span>
            <span class="text-slate-400 dark:text-slate-500">
              {formatDateTime(record.createdAt)}
            </span>
          </div>

          {/* 第二行：标签 */}
          {(socialKinds.value.length > 0 || visibleTags.value.length > 0) && (
            <div class="mb-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              {socialKinds.value.map((k) => (
                <span
                  key={`kind:${k}`}
                  class="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                >
                  {(() => {
                    if (k === RECORD_KINDS.TWEET_RETWEET) return "转推";
                    if (k === RECORD_KINDS.TWEET_FAVORITE) return "点赞推文";
                    if (k === RECORD_KINDS.TWEET_BOOKMARK) return "书签推文";
                    if (k === RECORD_KINDS.TWEET_REPLY) return "回复";
                    if (k === RECORD_KINDS.TOOT_BOOST) return "转嘟";
                    if (k === RECORD_KINDS.TOOT_FAVORITE) return "点赞嘟文";
                    if (k === RECORD_KINDS.TOOT_BOOKMARK) return "书签嘟文";
                    if (k === RECORD_KINDS.TOOT_REPLY) return "回复";
                    if (String(k).startsWith("toot:")) return "嘟文";
                    return "推文";
                  })()}
                </span>
              ))}
              {visibleTags.value.map((tag) => (
                <span
                  key={tag}
                  class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                  innerHTML={uiStore.formatInline(tag)}
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
                    innerHTML={uiStore.renderHighlight(record)}
                  ></div>
                  <div
                    class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 dark:text-slate-200"
                    innerHTML={uiStore.formatNote(record.note ?? "")}
                  ></div>
                </div>
              ) : (
                <div
                  class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70"
                  innerHTML={uiStore.renderHighlight(record)}
                ></div>
              )}
            </div>

            {/* 操作按钮 */}
            <div class="flex flex-col gap-2 text-xs font-semibold">
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
                onClick={() => handleAction(HighlightItemAction.view)}
              >
                查看
              </button>
              <button
                class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                type="button"
                onClick={() => handleAction(HighlightItemAction.edit)}
              >
                编辑
              </button>
              <button
                class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                type="button"
                onClick={() => handleAction(HighlightItemAction.copy)}
              >
                复制
              </button>
              {kind.value === RECORD_KINDS.HIGHLIGHT && (
                <button
                  class="whitespace-nowrap text-left text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  type="button"
                  onClick={() => handleAction(HighlightItemAction.downgrade)}
                >
                  降级
                </button>
              )}
              <button
                class="whitespace-nowrap text-left text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                type="button"
                onClick={() => handleAction(HighlightItemAction.delete)}
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
