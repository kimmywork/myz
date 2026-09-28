import type { InboxStatus } from "@myz/shared/inbox";
import { sendMessage } from "@myz/shared/messaging";
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
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

function excerpt(value: string | undefined, length = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default defineComponent({
  name: "InboxPage",
  setup() {
    const queue = ref<InboxQueueResult | null>(null);
    const activeTab = ref<Tab>("pending");
    const query = ref("");
    const selected = ref<Set<string>>(new Set());
    const focusMode = ref(false);
    const focusIndex = ref(0);
    const status = ref("");
    const undo = ref<UndoState | null>(null);
    let undoTimer: ReturnType<typeof setTimeout> | null = null;

    const items = computed<InboxQueueItem[]>(() => {
      const source = queue.value ? queue.value[activeTab.value] : [];
      const needle = query.value.trim().toLowerCase();
      if (!needle) return source;
      return source.filter((item) =>
        [item.record.text, item.record.note, item.record.title, item.record.url]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    });

    const counts = computed(
      () => queue.value?.counts ?? { pending: 0, snoozed: 0, marked: 0 },
    );
    const focusItem = computed(() => items.value[focusIndex.value] ?? null);

    async function load() {
      try {
        queue.value = await sendMessage<undefined, InboxQueueResult>(
          "myz:inboxQueue",
        );
        if (focusIndex.value >= items.value.length) {
          focusIndex.value = 0;
        }
      } catch (error) {
        status.value = `加载失败：${(error as Error).message}`;
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

    function keep(item: InboxQueueItem) {
      return applyStatus(item, "kept", { label: "已保留" });
    }
    function archive(item: InboxQueueItem) {
      return applyStatus(item, "archived", { label: "已归档" });
    }
    function snooze(item: InboxQueueItem) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return applyStatus(item, "snoozed", {
        snoozedUntil: tomorrow,
        label: "已稍后处理",
      });
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

    function snoozeBucket(
      item: InboxQueueItem,
      bucket: "evening" | "tomorrow" | "week",
    ) {
      return applyStatus(item, "snoozed", {
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

    function advance() {
      if (focusIndex.value < items.value.length) {
        focusIndex.value = Math.min(
          focusIndex.value + 1,
          Math.max(items.value.length - 1, 0),
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
      const item = focusItem.value;
      if (!item) return;
      const key = event.key.toLowerCase();
      const map: Record<
        string,
        "keep" | "archive" | "snooze" | "delete" | "mark"
      > = {
        k: "keep",
        a: "archive",
        s: "snooze",
        d: "delete",
        m: "mark",
      };
      if (key === " ") {
        event.preventDefault();
        advance();
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
      const chosen = items.value.filter((item) =>
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
      const chosen = items.value.filter((item) =>
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
    onUnmounted(() => {
      window.removeEventListener("keydown", onKeydown);
      clearUndo();
    });

    function renderRow(item: InboxQueueItem) {
      return (
        <div
          class="rounded-control border border-line bg-surface p-3 dark:border-line dark:bg-surface-2"
          data-testid="inbox-row"
        >
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected.value.has(item.targetId)}
              onChange={() => toggleSelect(item.targetId)}
              aria-label="选择"
            />
            <div class="min-w-0 flex-1">
              <div class="text-caption text-muted">
                {item.record.title || item.record.url || "未命名"}
                {item.marked ? " · 已标记" : ""}
              </div>
              <p class="mt-1 text-sm">
                {excerpt(item.record.text || item.record.note)}
              </p>
              <div class="mt-1 text-caption text-muted">
                {formatTime(item.record.createdAt)}
              </div>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="btn" type="button" onClick={() => keep(item)}>
              保留 K
            </button>
            <button class="btn" type="button" onClick={() => archive(item)}>
              归档 A
            </button>
            <button class="btn" type="button" onClick={() => snooze(item)}>
              稍后 S
            </button>
            <select
              class="rounded-control border border-line bg-surface px-2 py-1 text-sm"
              aria-label="稍后分桶"
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
              <option value="">稍后分桶…</option>
              <option value="evening">今天晚些</option>
              <option value="tomorrow">明天</option>
              <option value="week">本周</option>
            </select>
            <button class="btn" type="button" onClick={() => toggleMark(item)}>
              标记 M
            </button>
            <button class="btn" type="button" onClick={() => remove(item)}>
              删除 D
            </button>
          </div>
        </div>
      );
    }

    return () => (
      <section class="dashboard__page">
        <header class="mb-4 flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold">Inbox</h2>
          <span class="text-caption text-muted">
            待处理 {counts.value.pending} · 稍后 {counts.value.snoozed} · 已标记{" "}
            {counts.value.marked}
            {queue.value?.oldestPendingAt
              ? ` · 最早积压 ${formatTime(queue.value.oldestPendingAt)}`
              : ""}
          </span>
          {queue.value?.review ? (
            <span class="text-caption text-muted">
              回顾：超期稍后 {queue.value.review.overdueSnoozed} · 本周采集{" "}
              {queue.value.review.capturedThisWeek} · 本周处理{" "}
              {queue.value.review.handledThisWeek}
            </span>
          ) : null}
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
        </header>

        <div class="mb-3 flex flex-wrap items-center gap-2">
          {(["pending", "snoozed", "marked"] as Tab[]).map((tab) => (
            <button
              key={tab}
              class={["btn", activeTab.value === tab ? "btn--active" : ""].join(
                " ",
              )}
              type="button"
              onClick={() => {
                activeTab.value = tab;
                selected.value = new Set();
              }}
            >
              {tab === "pending"
                ? "待处理"
                : tab === "snoozed"
                  ? "稍后处理"
                  : "已标记"}
            </button>
          ))}
          <input
            type="search"
            placeholder="搜索原文、批注、标题、来源"
            value={query.value}
            onInput={(event: Event) =>
              (query.value = (event.target as HTMLInputElement).value)
            }
            class="rounded-control border border-line bg-surface px-2 py-1 text-sm"
          />
        </div>

        {selected.value.size > 0 ? (
          <div class="mb-3 flex flex-wrap gap-2">
            <span class="text-caption text-muted">
              已选 {selected.value.size}
            </span>
            <button
              class="btn"
              type="button"
              onClick={() => batchStatus("kept", "已保留")}
            >
              批量保留
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => batchStatus("archived", "已归档")}
            >
              批量归档
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => batchStatus("snoozed", "已稍后")}
            >
              批量稍后
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => void batchDelete()}
            >
              批量删除
            </button>
          </div>
        ) : null}

        {undo.value ? (
          <div class="mb-3 flex items-center gap-2 text-caption">
            <span>{undo.value.label}</span>
            <button class="btn" type="button" onClick={() => void revertUndo()}>
              撤销
            </button>
          </div>
        ) : null}

        {status.value ? (
          <p class="mb-3 text-caption text-muted">{status.value}</p>
        ) : null}

        {focusMode.value ? (
          <div
            data-testid="inbox-focus"
            class="rounded-control border border-line p-4"
          >
            {focusItem.value ? (
              <>
                <div class="text-caption text-muted">
                  {focusIndex.value + 1} / {items.value.length}
                </div>
                <p class="mt-2 text-base">
                  {excerpt(
                    focusItem.value.record.text || focusItem.value.record.note,
                    400,
                  )}
                </p>
                <div class="mt-1 text-caption text-muted">
                  {focusItem.value.record.title || focusItem.value.record.url}
                </div>
                <p class="mt-3 text-caption text-muted">
                  快捷键：K 保留 · A 归档 · S 稍后 · D 删除 · M 标记 · Space
                  下一条
                </p>
              </>
            ) : (
              <p class="text-caption text-muted">队列已清空</p>
            )}
          </div>
        ) : (
          <div class="grid gap-3">
            {items.value.map((item) => (
              <div key={item.targetId}>{renderRow(item)}</div>
            ))}
            {items.value.length === 0 ? (
              <p class="text-caption text-muted">没有匹配的记录</p>
            ) : null}
          </div>
        )}
      </section>
    );
  },
});
