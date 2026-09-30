import { Archive, Clock, Inbox, Star, Tag, Trash2 } from "@lucide/vue";
import { StatePanel } from "@myz/dashboard-ui";
import { IconClose, IconSearch } from "@myz/shared/icons";
import type { InboxStatus } from "@myz/shared/inbox";
import { sendMessage } from "@myz/shared/messaging";
import type { MyZRecord } from "@myz/shared/types";
import {
  computed,
  defineComponent,
  onMounted,
  onBeforeUnmount,
  ref,
} from "vue";
import type {
  InboxQueueItem,
  InboxQueueResult,
} from "@/background/messages/inbox";

type Tab = "pending" | "snoozed" | "marked";

interface UndoState {
  targetId: string;
  prevStatus: InboxStatus;
  prevSnoozedUntil?: string;
  wasMarked: boolean;
  label: string;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "pending", label: "待处理" },
  { key: "snoozed", label: "稍后处理" },
  { key: "marked", label: "已标记" },
];

function excerpt(value: string | undefined, length = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function hostOf(record: MyZRecord): string {
  if (record.hostname) return record.hostname;
  try {
    return new URL(record.url || "").hostname;
  } catch {
    return "";
  }
}

function kindLabel(record: MyZRecord): string {
  if (record.kind === "bookmark") return "书签";
  if (record.kind === "clip") return "摘录";
  return "划线";
}

function snoozeTarget(bucket: "evening" | "tomorrow" | "week"): string {
  const now = new Date();
  const target = new Date(now);
  if (bucket === "evening") {
    target.setHours(20, 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setTime(now.getTime() + 3 * 60 * 60 * 1000);
    }
  } else if (bucket === "tomorrow") {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else {
    const day = target.getDay();
    const delta = (5 - day + 7) % 7 || 5;
    target.setDate(target.getDate() + delta);
    target.setHours(18, 0, 0, 0);
  }
  return target.toISOString();
}

export default defineComponent({
  name: "InboxPage",
  setup() {
    const queue = ref<InboxQueueResult | null>(null);
    const allTags = ref<string[]>([]);
    const activeTab = ref<Tab>("pending");
    const activeTag = ref<string | null>(null);
    const query = ref("");
    const selected = ref<Set<string>>(new Set());
    const focusMode = ref(false);
    const focusIndex = ref(0);
    const sidebarOpen = ref(false);
    const status = ref("");
    const undo = ref<UndoState | null>(null);
    const tagQuery = ref("");
    const loading = ref(true);
    const loadError = ref("");
    const showAllTags = ref(false);
    const taggingId = ref<string | null>(null);
    const tagDraft = ref("");
    let undoTimer: ReturnType<typeof setTimeout> | null = null;
    let dragTargetIds: string[] = [];
    let dragTagName: string | null = null;

    const tabItems = computed<InboxQueueItem[]>(() => {
      if (!queue.value) return [];
      const source = queue.value[activeTab.value];
      const needle = query.value.trim().toLowerCase();
      return source.filter((item) => {
        if (
          activeTag.value &&
          !(item.record.tags || []).includes(activeTag.value)
        ) {
          return false;
        }
        if (!needle) return true;
        return [
          item.record.text,
          item.record.note,
          item.record.title,
          item.record.url,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      });
    });

    const tagCounts = computed<Array<{ tag: string; count: number }>>(() => {
      const seen = new Map<string, InboxQueueItem>();
      const source = queue.value;
      if (source) {
        for (const item of [
          ...source.pending,
          ...source.snoozed,
          ...source.marked,
        ]) {
          seen.set(item.targetId, item);
        }
      }
      const counts = new Map<string, number>();
      for (const item of seen.values()) {
        for (const tag of item.record.tags || []) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }
      const tags = new Set([...allTags.value, ...counts.keys()]);
      return Array.from(tags)
        .sort(
          (a, b) =>
            (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b),
        )
        .map((tag) => ({ tag, count: counts.get(tag) || 0 }));
    });

    const TAG_DISPLAY_CAP = 30;
    const visibleTags = computed(() => {
      const needle = tagQuery.value.trim().toLowerCase();
      if (needle) {
        return tagCounts.value.filter((entry) =>
          entry.tag.toLowerCase().includes(needle),
        );
      }
      return showAllTags.value
        ? tagCounts.value
        : tagCounts.value.slice(0, TAG_DISPLAY_CAP);
    });

    const workingSet = computed(() => {
      if (!queue.value) return [];
      const seen = new Map<string, InboxQueueItem>();
      for (const item of [
        ...queue.value.pending,
        ...queue.value.snoozed,
        ...queue.value.marked,
      ]) {
        seen.set(item.targetId, item);
      }
      return Array.from(seen.values());
    });

    const focusItem = computed(() => tabItems.value[focusIndex.value] ?? null);

    async function load() {
      loading.value = true;
      try {
        const [next, tags] = await Promise.all([
          sendMessage<undefined, InboxQueueResult>("myz:inboxQueue"),
          sendMessage<undefined, string[]>("myz:getAllTags"),
        ]);
        queue.value = next;
        allTags.value = Array.isArray(tags) ? tags : [];
        loadError.value = "";
        if (focusIndex.value >= tabItems.value.length) focusIndex.value = 0;
      } catch (error) {
        loadError.value = (error as Error).message;
      } finally {
        loading.value = false;
      }
    }

    function clearUndo() {
      if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
      undo.value = null;
    }

    function scheduleUndo(state: UndoState) {
      clearUndo();
      undo.value = state;
      undoTimer = setTimeout(() => {
        undo.value = null;
        undoTimer = null;
      }, 5000);
    }

    async function revertUndo() {
      const state = undo.value;
      if (!state) return;
      clearUndo();
      await sendMessage("myz:inboxSetStatus", {
        targetId: state.targetId,
        status: state.prevStatus,
        snoozedUntil: state.prevSnoozedUntil,
      });
      await sendMessage("myz:inboxSetMark", {
        targetId: state.targetId,
        marked: state.wasMarked,
      });
      await load();
    }

    async function applyStatus(
      item: InboxQueueItem,
      next: InboxStatus,
      options: { snoozedUntil?: string; label: string; undoable?: boolean },
    ) {
      await sendMessage("myz:inboxSetStatus", {
        targetId: item.targetId,
        status: next,
        snoozedUntil: options.snoozedUntil,
      });
      if (options.undoable !== false) {
        scheduleUndo({
          targetId: item.targetId,
          prevStatus: item.status,
          prevSnoozedUntil: item.state?.snoozedUntil,
          wasMarked: item.marked,
          label: options.label,
        });
      }
      await load();
      status.value = options.label;
    }

    const keep = (item: InboxQueueItem) =>
      applyStatus(item, "kept", { label: "已保留" });
    const archive = (item: InboxQueueItem) =>
      applyStatus(item, "archived", { label: "已归档" });
    const snooze = (item: InboxQueueItem) =>
      applyStatus(item, "snoozed", {
        snoozedUntil: snoozeTarget("tomorrow"),
        label: "已稍后处理",
      });

    async function snoozeBucket(
      item: InboxQueueItem,
      bucket: "evening" | "tomorrow" | "week",
    ) {
      await applyStatus(item, "snoozed", {
        snoozedUntil: snoozeTarget(bucket),
        label: "已稍后处理",
      });
    }

    async function toggleMark(item: InboxQueueItem) {
      await sendMessage("myz:inboxSetMark", {
        targetId: item.targetId,
        marked: !item.marked,
      });
      await load();
    }

    async function remove(item: InboxQueueItem) {
      if (!window.confirm("删除后不可撤销，确定删除？")) return;
      await sendMessage("myz:removeHighlight", { id: item.record.id });
      clearUndo();
      await load();
      status.value = "已删除";
    }

    async function assignTagMany(targetIds: string[], tag: string) {
      let applied = 0;
      for (const targetId of targetIds) {
        const item = workingSet.value.find(
          (entry) => entry.targetId === targetId,
        );
        if (!item) continue;
        const current = item.record.tags || [];
        if (current.includes(tag)) continue;
        await sendMessage("myz:updateHighlight", {
          id: item.record.id,
          tags: [...current, tag],
        });
        applied += 1;
      }
      await load();
      status.value = applied
        ? `已为 ${applied} 条加上标签「${tag}」`
        : `已存在标签「${tag}」`;
    }

    async function commitTagDraft(item: InboxQueueItem) {
      const tag = tagDraft.value.trim();
      taggingId.value = null;
      tagDraft.value = "";
      if (tag) await assignTagMany([item.targetId], tag);
    }

    async function removeTag(item: InboxQueueItem, tag: string) {
      const next = (item.record.tags || []).filter((entry) => entry !== tag);
      await sendMessage("myz:updateHighlight", {
        id: item.record.id,
        tags: next,
      });
      await load();
      status.value = `已移除标签「${tag}」`;
    }

    function startRecordDrag(item: InboxQueueItem, event: DragEvent) {
      dragTagName = null;
      dragTargetIds =
        selected.value.size > 0 && selected.value.has(item.targetId)
          ? Array.from(selected.value)
          : [item.targetId];
      event.dataTransfer?.setData("text/plain", dragTargetIds.join(","));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    }

    function startTagDrag(tag: string, event: DragEvent) {
      dragTagName = tag;
      dragTargetIds = [];
      event.dataTransfer?.setData("text/plain", `tag:${tag}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    }

    function endDrag() {
      dragTargetIds = [];
      dragTagName = null;
    }

    function onDropOnTag(event: DragEvent, tag: string) {
      event.preventDefault();
      if (dragTagName) return;
      void assignTagMany(dragTargetIds, tag);
      endDrag();
    }

    function onDropOnRecord(event: DragEvent, item: InboxQueueItem) {
      event.preventDefault();
      if (dragTagName) {
        void assignTagMany([item.targetId], dragTagName);
      }
      endDrag();
    }

    function advance() {
      if (focusIndex.value < tabItems.value.length) {
        focusIndex.value = Math.min(
          focusIndex.value + 1,
          Math.max(tabItems.value.length - 1, 0),
        );
      }
    }

    async function runAction(
      item: InboxQueueItem,
      action: "keep" | "archive" | "snooze" | "delete" | "mark",
    ) {
      if (action === "keep") await keep(item);
      else if (action === "archive") await archive(item);
      else if (action === "snooze") await snooze(item);
      else if (action === "delete") await remove(item);
      else await toggleMark(item);
      if (action !== "mark" && focusMode.value) advance();
    }

    function onKeydown(event: KeyboardEvent) {
      if (!focusMode.value) return;
      if (event.key === "Escape") {
        focusMode.value = false;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const item = focusItem.value;
      if (!item) return;
      const key = event.key.toLowerCase();
      const map: Record<
        string,
        "keep" | "archive" | "snooze" | "delete" | "mark"
      > = { k: "keep", a: "archive", s: "snooze", d: "delete", m: "mark" };
      if (key === " ") {
        event.preventDefault();
        advance();
        return;
      }
      if (/^[1-9]$/.test(key)) {
        const tag = tagCounts.value[Number(key) - 1]?.tag;
        if (tag) {
          event.preventDefault();
          void assignTagMany([item.targetId], tag);
        }
        return;
      }
      if (map[key]) {
        event.preventDefault();
        void runAction(item, map[key]);
      }
    }

    function toggleSelect(targetId: string) {
      const next = new Set(selected.value);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      selected.value = next;
    }

    async function batchStatus(next: InboxStatus, label: string) {
      const chosen = tabItems.value.filter((item) =>
        selected.value.has(item.targetId),
      );
      for (const item of chosen) {
        await sendMessage("myz:inboxSetStatus", {
          targetId: item.targetId,
          status: next,
        });
      }
      selected.value = new Set();
      await load();
      status.value = `${label}（${chosen.length}）`;
    }

    async function batchDelete() {
      const chosen = tabItems.value.filter((item) =>
        selected.value.has(item.targetId),
      );
      if (!chosen.length) return;
      if (!window.confirm(`删除 ${chosen.length} 条记录？删除不可撤销。`))
        return;
      await sendMessage("myz:removeRecordsByIds", {
        ids: chosen.map((item) => item.record.id),
      });
      selected.value = new Set();
      await load();
      status.value = `已删除（${chosen.length}）`;
    }

    onMounted(() => {
      void load();
      window.addEventListener("keydown", onKeydown);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown);
      clearUndo();
    });

    function renderPill(item: InboxQueueItem) {
      if (item.state?.status === "snoozed" && item.state.snoozedUntil) {
        return (
          <span class="inline-flex items-center gap-1 rounded-tag bg-surface-2 px-2 py-0.5 text-tag text-muted">
            <Clock size={12} />
            稍后 · {formatTime(item.state.snoozedUntil)}
          </span>
        );
      }
      if (item.status === "pending") {
        return (
          <span class="inline-flex items-center gap-1 rounded-tag bg-info-bg px-2 py-0.5 text-tag text-info">
            <Inbox size={12} />
            待处理
          </span>
        );
      }
      return (
        <span class="inline-flex items-center gap-1 rounded-tag bg-surface-2 px-2 py-0.5 text-tag text-muted">
          {item.status === "archived" ? (
            <>
              <Archive size={12} /> 已归档
            </>
          ) : (
            "已保留"
          )}
        </span>
      );
    }

    function renderRow(item: InboxQueueItem) {
      return (
        <article
          data-testid="inbox-row"
          draggable
          onDragstart={(event: DragEvent) => startRecordDrag(item, event)}
          onDragend={endDrag}
          onDragover={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => onDropOnRecord(event, item)}
          class="rounded-panel border border-line bg-surface p-3 dark:border-line dark:bg-surface"
        >
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-1"
              checked={selected.value.has(item.targetId)}
              onChange={() => toggleSelect(item.targetId)}
              aria-label="选择"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-tag border border-line px-1.5 py-0.5 text-tag text-muted">
                  {kindLabel(item.record)}
                </span>
                {renderPill(item)}
                {item.marked ? (
                  <span class="inline-flex items-center gap-1 text-tag text-accent-text">
                    <Star size={12} /> 已标记
                  </span>
                ) : null}
              </div>
              <p
                class="mt-1 text-compact text-text"
                style="font-family: var(--myz-read); line-height: 1.55"
              >
                {excerpt(item.record.text || item.record.note)}
              </p>
              <div class="mt-1 text-caption text-muted">
                {item.record.title || hostOf(item.record)}
                {item.record.title && hostOf(item.record)
                  ? ` · ${hostOf(item.record)}`
                  : ""}
                {" · "}
                {formatTime(item.record.createdAt)}
              </div>
              {item.record.tags && item.record.tags.length > 0 ? (
                <div class="mt-1 flex flex-wrap items-center gap-1">
                  {item.record.tags.map((tag) => (
                    <span
                      key={tag}
                      class="inline-flex items-center gap-1 rounded-tag border border-line px-1.5 py-0.5 text-tag text-muted"
                    >
                      {tag}
                      <button
                        type="button"
                        class="hit-expand text-muted hover:text-error"
                        aria-label={`移除标签 ${tag}`}
                        onClick={() => void removeTag(item, tag)}
                      >
                        <IconClose size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button
              class="btn btn-small"
              type="button"
              onClick={() => toggleMark(item)}
              title="标记"
            >
              <Star size={14} /> 标记
            </button>
            <button
              class="btn btn-small"
              type="button"
              aria-expanded={taggingId.value === item.targetId}
              onClick={() => {
                taggingId.value =
                  taggingId.value === item.targetId ? null : item.targetId;
                tagDraft.value = "";
              }}
            >
              <Tag size={14} /> 标签
            </button>
            {taggingId.value === item.targetId ? (
              <input
                type="text"
                list="inbox-tag-options"
                aria-label="添加标签"
                autofocus
                class="h-8 rounded-control border border-line bg-surface px-2 text-caption text-text"
                value={tagDraft.value}
                placeholder="输入标签后回车"
                onInput={(event: Event) =>
                  (tagDraft.value = (event.target as HTMLInputElement).value)
                }
                onKeydown={(event: KeyboardEvent) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitTagDraft(item);
                  } else if (event.key === "Escape") {
                    taggingId.value = null;
                    tagDraft.value = "";
                  }
                }}
                onBlur={() => void commitTagDraft(item)}
              />
            ) : null}
            <button
              class="btn btn-small"
              type="button"
              onClick={() => keep(item)}
            >
              保留
            </button>
            <div class="relative flex items-center">
              <Clock
                size={14}
                class="pointer-events-none absolute left-2 text-muted"
              />
              <select
                class="btn btn-small appearance-none pl-7"
                aria-label="稍后"
                value=""
                onChange={(event: Event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  if (
                    value === "evening" ||
                    value === "tomorrow" ||
                    value === "week"
                  ) {
                    void snoozeBucket(item, value);
                    (event.target as HTMLSelectElement).value = "";
                  }
                }}
              >
                <option value="">稍后</option>
                <option value="evening">今天晚些</option>
                <option value="tomorrow">明天</option>
                <option value="week">本周</option>
              </select>
            </div>
            <button
              class="btn btn-small"
              type="button"
              onClick={() => archive(item)}
            >
              <Archive size={14} /> 归档
            </button>
            <button
              class="btn btn-small btn-danger"
              type="button"
              onClick={() => remove(item)}
            >
              <Trash2 size={14} /> 删除
            </button>
          </div>
        </article>
      );
    }

    function renderSidebar() {
      return (
        <aside class="flex w-full flex-col gap-4 min-[900px]:w-60 min-[900px]:shrink-0">
          <div class="rounded-panel border border-line bg-surface p-3 dark:border-line">
            <div class="mb-2 text-tag font-semibold uppercase tracking-wide text-muted">
              队列
            </div>
            <nav class="space-y-1">
              {TABS.map((tab) => {
                const active = activeTab.value === tab.key;
                const count = queue.value?.counts[tab.key] ?? 0;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      activeTab.value = tab.key;
                      selected.value = new Set();
                      sidebarOpen.value = false;
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
              value={tagQuery.value}
              onInput={(event: Event) =>
                (tagQuery.value = (event.target as HTMLInputElement).value)
              }
              class="mb-2 h-8 w-full rounded-control border border-line bg-surface px-2 text-caption text-text"
            />
            <div class="flex flex-wrap gap-1">
              {visibleTags.value.length === 0 ? (
                <span class="text-caption text-muted">
                  {tagCounts.value.length === 0 ? "暂无标签" : "没有匹配标签"}
                </span>
              ) : (
                visibleTags.value.map(({ tag, count }) => {
                  const active = activeTag.value === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      data-testid="inbox-tag"
                      draggable
                      onDragstart={(event: DragEvent) =>
                        startTagDrag(tag, event)
                      }
                      onDragend={endDrag}
                      onClick={() => {
                        activeTag.value = active ? null : tag;
                        sidebarOpen.value = false;
                      }}
                      onDragover={(event: DragEvent) => event.preventDefault()}
                      onDrop={(event: DragEvent) => onDropOnTag(event, tag)}
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
            {!tagQuery.value.trim() &&
            tagCounts.value.length > TAG_DISPLAY_CAP ? (
              <button
                class="btn btn-small mt-2"
                type="button"
                onClick={() => (showAllTags.value = !showAllTags.value)}
              >
                {showAllTags.value
                  ? "收起标签"
                  : `显示全部 ${tagCounts.value.length} 个标签`}
              </button>
            ) : null}
          </div>
        </aside>
      );
    }

    return () => (
      <section class="space-y-4">
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-heading font-semibold text-text">Inbox</h2>
            <p class="text-caption text-muted">
              待处理 {queue.value?.counts.pending ?? 0} 条
              {queue.value?.oldestPendingAt
                ? ` · 最早积压 ${formatTime(queue.value.oldestPendingAt)}`
                : ""}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn min-[900px]:hidden"
              type="button"
              onClick={() => (sidebarOpen.value = !sidebarOpen.value)}
            >
              筛选 / 标签
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => {
                focusMode.value = !focusMode.value;
                focusIndex.value = 0;
              }}
            >
              {focusMode.value ? "退出专注" : "专注处理"}
            </button>
          </div>
        </header>

        <div class="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start">
          <div
            class={[
              sidebarOpen.value ? "block" : "hidden",
              "min-[900px]:block",
            ].join(" ")}
          >
            {renderSidebar()}
          </div>

          <div class="min-w-0 flex-1 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <div class="relative min-w-0 flex-1">
                <IconSearch
                  size={16}
                  class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  placeholder="搜索原文、批注、标题、标签、来源"
                  value={query.value}
                  onInput={(event: Event) =>
                    (query.value = (event.target as HTMLInputElement).value)
                  }
                  class="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-3 text-compact text-text"
                />
              </div>
            </div>
            <datalist id="inbox-tag-options">
              {allTags.value.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>

            {activeTag.value ? (
              <p class="text-caption text-muted">
                已筛选标签「{activeTag.value}」·
                <button
                  class="btn-link"
                  type="button"
                  onClick={() => (activeTag.value = null)}
                >
                  清除
                </button>
              </p>
            ) : null}

            {selected.value.size > 0 ? (
              <div class="flex flex-wrap gap-2 rounded-control border border-line bg-surface-2 p-2">
                <span class="text-caption text-muted">
                  已选 {selected.value.size}
                </span>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => batchStatus("kept", "已保留")}
                >
                  批量保留
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => batchStatus("archived", "已归档")}
                >
                  批量归档
                </button>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => batchStatus("snoozed", "已稍后")}
                >
                  批量稍后
                </button>
                <button
                  class="btn btn-small btn-danger"
                  type="button"
                  onClick={() => void batchDelete()}
                >
                  批量删除
                </button>
              </div>
            ) : null}

            {undo.value ? (
              <div
                class="flex items-center gap-2 text-caption"
                role="status"
                aria-live="polite"
              >
                <span>{undo.value.label}</span>
                <button
                  class="btn btn-small"
                  type="button"
                  onClick={() => void revertUndo()}
                >
                  撤销
                </button>
              </div>
            ) : null}

            {status.value ? (
              <p
                class="text-caption text-muted"
                role="status"
                aria-live="polite"
              >
                {status.value}
              </p>
            ) : null}

            {loading.value ? (
              <StatePanel kind="loading" title="正在加载 Inbox…" />
            ) : loadError.value ? (
              <StatePanel
                kind="error"
                title="Inbox 加载失败"
                hint={loadError.value}
                actionLabel="重试"
                onAction={() => void load()}
              />
            ) : null}

            {loading.value || loadError.value ? null : focusMode.value ? (
              <div
                data-testid="inbox-focus"
                draggable={Boolean(focusItem.value)}
                onDragstart={(event: DragEvent) => {
                  if (focusItem.value) startRecordDrag(focusItem.value, event);
                }}
                onDragend={endDrag}
                onDragover={(event: DragEvent) => event.preventDefault()}
                onDrop={(event: DragEvent) => {
                  if (focusItem.value) onDropOnRecord(event, focusItem.value);
                }}
                class="rounded-panel border border-line bg-surface p-4"
              >
                {focusItem.value ? (
                  <>
                    <div class="text-caption text-muted">
                      {focusIndex.value + 1} / {tabItems.value.length}
                    </div>
                    <p
                      class="mt-2 text-base"
                      style="font-family: var(--myz-read); line-height: 1.55"
                    >
                      {excerpt(
                        focusItem.value.record.text ||
                          focusItem.value.record.note,
                        400,
                      )}
                    </p>
                    <div class="mt-1 text-caption text-muted">
                      {focusItem.value.record.title ||
                        hostOf(focusItem.value.record)}
                    </div>
                    <p class="mt-3 text-caption text-muted">
                      快捷键：K 保留 · A 归档 · S 稍后 · D 删除 · M 标记 · Space
                      下一条 · 1–9 打标签 · Esc 退出
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        class="btn btn-small"
                        type="button"
                        onClick={() => void runAction(focusItem.value!, "keep")}
                      >
                        保留
                      </button>
                      <button
                        class="btn btn-small"
                        type="button"
                        onClick={() =>
                          void runAction(focusItem.value!, "archive")
                        }
                      >
                        归档
                      </button>
                      <button
                        class="btn btn-small"
                        type="button"
                        onClick={() =>
                          void runAction(focusItem.value!, "snooze")
                        }
                      >
                        稍后
                      </button>
                      <button
                        class="btn btn-small"
                        type="button"
                        onClick={() => void runAction(focusItem.value!, "mark")}
                      >
                        标记
                      </button>
                      <button
                        class="btn btn-small btn-danger"
                        type="button"
                        onClick={() =>
                          void runAction(focusItem.value!, "delete")
                        }
                      >
                        删除
                      </button>
                      <button
                        class="btn btn-small"
                        type="button"
                        onClick={() => advance()}
                      >
                        下一条
                      </button>
                    </div>
                  </>
                ) : (
                  <p class="text-caption text-muted">队列已清空</p>
                )}
              </div>
            ) : (
              <div class="grid gap-3">
                {tabItems.value.map((item) => (
                  <div key={item.targetId}>{renderRow(item)}</div>
                ))}
                {tabItems.value.length === 0 ? (
                  <p class="text-caption text-muted">没有匹配的记录</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  },
});
