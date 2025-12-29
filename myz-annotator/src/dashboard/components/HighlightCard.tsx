import { computed, defineComponent, ref } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { MyZRecord, RECORD_KINDS, getRecordKind } from "@/shared/types.js";
import { formatDateTime } from "@/dashboard/utils/records.js";

export enum HighlightItemAction {
  "copy" = "copy",
  "view" = "view",
  "edit" = "edit",
  "delete" = "delete",
  "downgrade" = "downgrade",
}

export default defineComponent({
  name: "HighlightCard",
  props: {
    record: {
      type: Object as () => MyZRecord | undefined,
      required: true,
      default: () => ({}),
    },
  },
  setup(props: { record?: MyZRecord }) {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const kind = computed(() => getRecordKind(props.record));
    const isSocial = computed(() => {
      const value = String(kind.value);
      return value.startsWith("tweet:") || value.startsWith("toot:");
    });
    const socialKinds = computed(() => {
      const raw = (props.record as any)?.socialKinds || (props.record as any)?.tweetKinds;
      if (Array.isArray(raw) && raw.length) {
        return raw as string[];
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

    const kindLabel = computed(() => {
      const kind = getRecordKind(props.record);
      switch (kind) {
        case RECORD_KINDS.CLIP:
          return "保存文字";
        case RECORD_KINDS.AI_GENERATED:
          return "AI摘录";
        case RECORD_KINDS.TWEET_POST:
          return "推文";
        case RECORD_KINDS.TWEET_REPLY:
          return "回复";
        case RECORD_KINDS.TWEET_RETWEET:
          return "转推";
        case RECORD_KINDS.TWEET_FAVORITE:
          return "点赞推文";
        case RECORD_KINDS.TWEET_BOOKMARK:
          return "书签推文";
        case RECORD_KINDS.TOOT_POST:
          return "嘟文";
        case RECORD_KINDS.TOOT_REPLY:
          return "嘟文回复";
        case RECORD_KINDS.TOOT_BOOST:
          return "转嘟";
        case RECORD_KINDS.TOOT_FAVORITE:
          return "点赞嘟文";
        case RECORD_KINDS.TOOT_BOOKMARK:
          return "书签嘟文";
        default:
          return "划线标注";
      }
    });
    function getTweetKindBadgeLabel(value: string) {
      if (value === RECORD_KINDS.TWEET_RETWEET) return "转推";
      if (value === RECORD_KINDS.TWEET_FAVORITE) return "点赞推文";
      if (value === RECORD_KINDS.TWEET_BOOKMARK) return "书签推文";
      if (value === RECORD_KINDS.TWEET_REPLY) return "回复";
      if (value === RECORD_KINDS.TOOT_BOOST) return "转嘟";
      if (value === RECORD_KINDS.TOOT_FAVORITE) return "点赞嘟文";
      if (value === RECORD_KINDS.TOOT_BOOKMARK) return "书签嘟文";
      if (value === RECORD_KINDS.TOOT_REPLY) return "回复";
      if (String(value).startsWith("toot:")) return "嘟文";
      return "推文";
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
          uiStore.openModal(id, "view");
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
    const cardClasses = computed(() => {
      const original = [
        "space-y-4 rounded-3xl border border-slate-200 bg-white/95 p-5 text-sm text-slate-800 shadow-xl transition dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
      ];
      if (kind.value === RECORD_KINDS.CLIP) {
        original.push("border-teal-200 dark:border-cyan-500/30");
      }
      if (kind.value === RECORD_KINDS.AI_GENERATED) {
        original.push("border-fuchsia-200 dark:border-fuchsia-500/40");
      }
      if (isSocial.value) {
        original.push("border-sky-200 dark:border-sky-500/30");
      }
      return original;
    });

    return () => {
      return (
        <article
          class={cardClasses.value.join(" ")}
          data-id={props.record?.id}
          data-kind={kind.value}
        >
          <div class="flex items-center justify-between">
            <span
              class={[
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                kind.value === RECORD_KINDS.AI_GENERATED
                  ? "bg-fuchsia-500 text-white"
                  : kind.value === RECORD_KINDS.CLIP
                    ? "bg-teal-500 text-white"
                    : isSocial.value
                      ? "bg-sky-500 text-white"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
              ].join(" ")}
            >
              {kindLabel.value}
            </span>
            <div class="flex flex-col items-end text-xs text-slate-400">
              <span
                class="max-w-[120px] truncate text-slate-500 dark:text-slate-300"
                title={props.record?.hostname || props.record?.url || ""}
                innerHTML={uiStore.formatInline(
                  (props.record?.hostname || props.record?.url || "").substring(
                    0,
                    20,
                  ) +
                    ((props.record?.hostname || props.record?.url || "")
                      .length > 20
                      ? "..."
                      : ""),
                )}
              ></span>
              <span class="text-slate-400 dark:text-slate-500">
                {formatDateTime(props.record?.createdAt!!)}
              </span>
            </div>
          </div>

          {shouldSplitLayout.value ? (
            <div class="grid gap-4 sm:grid-cols-2">
              <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {kindLabel.value}
                </h4>
                <blockquote
                  class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
                  innerHTML={uiStore.renderHighlight(props.record!!)}
                ></blockquote>
              </section>
              <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  批注
                </h4>
                <p
                  data-testid="card-note"
                  class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
                  innerHTML={uiStore.formatNote(props.record?.note ?? "")}
                ></p>
              </section>
            </div>
          ) : (
            <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {kindLabel.value}
              </h4>
              <blockquote
                class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
                innerHTML={uiStore.renderHighlight(props.record!!)}
              ></blockquote>
            </section>
          )}

          <div class="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            {socialKinds.value.length
              ? socialKinds.value.map((k) => (
                  <span
                    key={`kind:${k}`}
                    class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                  >
                    {getTweetKindBadgeLabel(k)}
                  </span>
                ))
              : null}
            {visibleTags.value.length
              ? visibleTags.value.map((tag) => (
                  <span
                    key={tag}
                    class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                    innerHTML={uiStore.formatInline(tag)}
                  ></span>
                ))
              : "无标签"}
            {hiddenTagsCount.value > 0 && (
              <button
                type="button"
                class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
                onClick={toggleTags}
              >
                +{hiddenTagsCount.value} 个标签
              </button>
            )}
          </div>

          <div class="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-xs font-semibold dark:border-white/5">
            <a
              class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              href={props.record?.sourceUrl || props.record?.url}
              target="_blank"
              rel="noopener"
              title={props.record?.title || props.record?.url}
            >
              页面
            </a>
            <button
              data-action="view"
              class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => handleAction(HighlightItemAction.view)}
            >
              查看
            </button>
            <button
              data-action="edit"
              class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => handleAction(HighlightItemAction.edit)}
            >
              编辑
            </button>
            <button
              data-action="copy"
              class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => handleAction(HighlightItemAction.copy)}
            >
              复制
            </button>
            {kind.value === RECORD_KINDS.HIGHLIGHT && (
              <button
                data-action="downgrade"
                class="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                type="button"
                onClick={() => handleAction(HighlightItemAction.downgrade)}
              >
                降级
              </button>
            )}
            <button
              data-action="delete"
              class="text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
              type="button"
              onClick={() => handleAction(HighlightItemAction.delete)}
            >
              删除
            </button>
          </div>
        </article>
      );
    };
  },
});
