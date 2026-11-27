import type { PageSnapshot } from "@myz/core/page-snapshot";
import { snapshotHeaderLine } from "@myz/core/page-snapshot";
import { computed, defineComponent, nextTick, ref, watch } from "vue";
import type { PropType } from "vue";
import { resolveRecordAnchor } from "./snapshot-anchor.js";
import {
  renderSnapshotBody,
  snapshotTextOf,
  type SnapshotMark,
} from "./snapshot-body.js";
import {
  buildSnapshotDisplay,
  repaintGap,
  type SnapshotGapState,
} from "./snapshot-collapse.js";
import { invoke } from "@/messaging/invoke.js";

/** The only record fields the anchoring needs. */
type PageRecordRef = {
  id: string;
  text?: string;
  anchorText?: string;
  note?: string;
  color?: string;
  style?: unknown;
};

/**
 * The page's snapshot, read-only (§I8, revised 2026-11-23).
 *
 * Snapshots are **page-bound**: one copy per page, every record of the page
 * anchors onto it. Display is the blur-fade form (user 2026-11-23: 「只显示
 * 高亮的部分，其他渐入渐出式模糊掉」): only the annotated regions render
 * sharp; the surrounding copy stays in place, blurred with a fade. Long
 * hidden runs chunk at ~半屏 with 「…」 seams close together; each click opens
 * one chunk and the view glides to it (animated follow, 上/下), a seam click
 * opens the whole run. Fonts come from the shared markdown render tokens;
 * notes sit in the document's side gutter (Word-review-style).
 */
export const ViewerSnapshotView = defineComponent({
  name: "ViewerSnapshotView",
  props: {
    /** The record's page URL — the snapshot's identity. */
    pageUrl: { type: String, required: true },
    /** Every record of this page, so all of them anchor onto the copy. */
    records: {
      type: Array as PropType<PageRecordRef[]>,
      default: () => [],
    },
    /** The record being read; its mark is emphasised and scrolled to. */
    activeId: { type: String, default: "" },
    /** Clicking a mark selects that record (the snapshot is the navigation). */
    onSelectRecord: {
      type: Function as PropType<(recordId: string) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const snapshot = ref<PageSnapshot | null>(null);
    /** The page's copy, newest first — at most one: a save replaces (§I9). */
    const versions = ref<PageSnapshot[]>([]);
    const statusLine = ref("");
    const loading = ref(true);
    const error = ref("");
    /** Only the first load per page needs a spinner. */
    const loadedFor = ref("");
    const bodyRef = ref<HTMLElement | null>(null);
    /** Monotonic id: a slower earlier load must not overwrite a newer one. */
    let requestId = 0;

    async function load() {
      const pageUrl = props.pageUrl;
      if (!pageUrl) return;
      const request = ++requestId;
      if (loadedFor.value !== pageUrl) loading.value = true;
      error.value = "";
      try {
        const [found, usage] = await Promise.all([
          invoke("myz:getSnapshotsForPage", { url: pageUrl }),
          invoke("myz:getSnapshotUsage"),
        ]);
        // Navigating A → B: A's answer arriving late must not replace B's.
        if (request !== requestId) return;
        versions.value = found;
        snapshot.value = found[0] ?? null;
        statusLine.value = usage?.statusLine ?? "";
        gaps = [];
        loadedFor.value = pageUrl;
      } catch (loadError) {
        if (request !== requestId) return;
        console.warn("Failed to load snapshot", loadError);
        error.value = "快照读取失败";
        snapshot.value = null;
      } finally {
        if (request === requestId) loading.value = false;
      }
    }

    watch(
      () => props.pageUrl,
      () => void load(),
      { immediate: true },
    );

    /**
     * Placement of every record of this page. The haystack is the exact text
     * the marking walks (one matcher, `snapshot-body`), so "located" and
     * "marked" can never disagree; the answer is stable because it is computed
     * from the stored body, not from a live page.
     */
    const placements = computed(() => {
      if (!snapshot.value) return [];
      const haystack = snapshotTextOf(snapshot.value.html);
      return props.records.map((record) => {
        // Snapshots hold flattened DOM text; record.text is Markdown. Compare
        // plain text, falling back across both representations (2026-11-27).
        const { text: needle, anchor } = resolveRecordAnchor(record, haystack);
        return { id: record.id, text: needle, anchor };
      });
    });

    const locatedMarks = computed<SnapshotMark[]>(() =>
      placements.value
        .filter((entry) => entry.anchor.status === "located" && entry.text)
        .map((entry) => {
          const record = props.records.find((r) => r.id === entry.id);
          return {
            id: entry.id,
            text: entry.text,
            style: record?.style,
            color: record?.color,
            note: record?.note?.trim() ? record.note.trim() : undefined,
          };
        }),
    );

    /**
     * Notes by record id, shown in the page-margin comment popover.
     *
     * Null-prototype: an id like `__proto__` must become an own key instead of
     * running the inherited setter, or that record's note silently vanishes
     * (CodeRabbit #136).
     */
    const notes = computed<Record<string, string>>(() => {
      const map: Record<string, string> = Object.create(null) as Record<
        string,
        string
      >;
      for (const mark of locatedMarks.value) {
        if (mark.note) map[mark.id] = mark.note;
      }
      return map;
    });

    /**
     * Open page-margin comment popover (2026-11-23 三修): the note lives on
     * an icon at the page edge beside its region and opens on demand, so the
     * reading column keeps its full width.
     */
    const notePopover = ref<{
      id: string;
      text: string;
      x: number;
      y: number;
      /** Room left below `y`, so a long note scrolls instead of overflowing. */
      maxHeight: number;
    } | null>(null);

    /** The icon that opened the popover, for returning keyboard focus. */
    let noteOpener: HTMLElement | null = null;

    /** Focus target inside the popover; focused as soon as it renders. */
    const noteCloseRef = ref<HTMLButtonElement | null>(null);

    function closeNotePopover(options: { restoreFocus?: boolean } = {}) {
      const opener = noteOpener;
      noteOpener = null;
      notePopover.value = null;
      if (options.restoreFocus && opener?.isConnected) opener.focus();
    }

    // A page switch rebuilds the body and drops the icons the popover came
    // from; the popover itself would linger with the old page's text and
    // coordinates (CodeRabbit #136).
    watch(
      () => props.pageUrl,
      () => closeNotePopover(),
    );
    // A note that disappears (record edited in another surface) must not stay
    // open on stale text either.
    watch(notes, (map) => {
      if (notePopover.value && !map[notePopover.value.id]) closeNotePopover();
    });

    const locatedCount = computed(
      () =>
        placements.value.filter((p) => p.anchor.status === "located").length,
    );
    const unlocatedCount = computed(
      () =>
        placements.value.filter((p) => p.anchor.status === "unlocated").length,
    );

    /** The active record's placement, for the "未能定位" notice. */
    const activePlacement = computed(
      () =>
        placements.value.find((entry) => entry.id === props.activeId) ?? null,
    );

    /**
     * Fold state per hidden run (2026-11-23 定稿): one 「…」 seam per run;
     * its halves unfold a block at a time, the glyph unfolds all. Plain on
     * purpose (not a ref): reveals repaint the DOM in place and must NOT
     * trigger a Vue re-render — an innerHTML rebuild replays every entrance
     * animation and re-creates every node, which is the jitter the user saw
     * (2026-11-24). The body is only rebuilt when the content changes
     * (snapshot / records / active record), picking up this state as-is.
     */
    let gaps: SnapshotGapState[] = [];

    /** Marked body in the fold form: sharp highlights, folded context. */
    const body = computed(() => {
      if (!snapshot.value) return "";
      const marked = renderSnapshotBody(snapshot.value, locatedMarks.value);
      return buildSnapshotDisplay(marked, props.activeId, notes.value, gaps);
    });

    /** Ensures the state array reaches index `gap` (a click may lead). */
    function ensureGap(gap: number) {
      while (gaps.length <= gap) {
        gaps.push({ upRev: 0, downRev: 0, expanded: false });
      }
    }

    /**
     * Applies one reveal and re-pins its anchor — all in the SAME frame
     * (2026-11-24 抖动修复): repaint is an in-place class swap on existing
     * nodes (no innerHTML rebuild → no entrance-animation replay anywhere),
     * and the scroll compensation runs right after the layout shift, before
     * the browser paints. The anchor therefore never visibly moves.
     */
    function revealWithAnchor(
      gap: number,
      state: SnapshotGapState,
      anchorEl: HTMLElement | null,
    ) {
      const root = bodyRef.value;
      if (!root) return;
      const before = anchorEl?.getBoundingClientRect().top ?? null;
      const unitId = anchorEl?.getAttribute("data-myz-unit") ?? "";
      gaps[gap] = state;
      repaintGap(root, gap, state);
      if (before === null || !unitId) return;
      const after = root.querySelector(
        `[data-myz-unit="${unitId}"]`,
      ) as HTMLElement | null;
      const delta = (after?.getBoundingClientRect().top ?? before) - before;
      if (Math.abs(delta) > 1) {
        // Instant compensation, same frame: a smooth glide would move the
        // anchor mid-flight, violating 「点击部分的位置始终保持不变」.
        const container = root.closest(".myz-workspace__body");
        (container as HTMLElement | null)?.scrollBy({ top: delta });
      }
    }

    /**
     * The gap's outer visual anchor on one side: the highlight region above
     * (up, A) or below (down, G). The fold display records each gap's two
     * region ids (`data-up-region`/`data-down-region`), so this is a lookup —
     * no sibling walking. That anchor is the reader's reference point and
     * must not move (2026-11-24).
     */
    function outerRegion(gap: number, side: "up" | "down"): HTMLElement | null {
      const holder =
        bodyRef.value?.querySelector(
          `[data-tear="gap-${gap}"], .myz-snapshot-fold-hint[data-gap="${gap}"]`,
        ) ?? null;
      const id = holder?.getAttribute(
        side === "up" ? "data-up-region" : "data-down-region",
      );
      if (id === null || id === undefined || id === "" || id === "-1") {
        return null;
      }
      return (
        (bodyRef.value?.querySelector(
          `[data-region="${id}"]`,
        ) as HTMLElement | null) ?? null
      );
    }

    /**
     * Whether an element is inside the reading area the user actually sees:
     * the workspace scroll container clips its content at its own edges, so a
     * window-only test can pass for a highlight hidden above the body
     * (CodeRabbit #136).
     */
    function isInReadingViewport(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      const container = bodyRef.value?.closest(
        ".myz-workspace__body",
      ) as HTMLElement | null;
      if (!container) {
        return rect.bottom > 0 && rect.top < window.innerHeight;
      }
      const bounds = container.getBoundingClientRect();
      const top = Math.max(bounds.top, 0);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      return rect.bottom > top && rect.top < bottom;
    }

    /**
     * Reveal one block on one side (from the highlight edge inward).
     *
     * Positioning (2026-11-24): the visual anchor stays screen-fixed — the
     * outer highlight on the clicked side (A above / G below); when it is out
     * of the viewport, the clicked element itself is the anchor (a full-block
     * hint never moves — revealing only unblurs it). Never "scroll the
     * revealed block into view".
     */
    function revealStep(
      gap: number,
      side: "up" | "down",
      clicked: HTMLElement | null,
    ) {
      const region = outerRegion(gap, side);
      const regionVisible = Boolean(region && isInReadingViewport(region));
      // Rule 4 (2026-11-24): A/G off-screen → the clicked element is the
      // anchor. A hint is a whole block (`data-myz-unit`); a seam-half has
      // no unit id, so it anchors the block on its side — the one being
      // revealed, which never moves (pure unblur).
      const clickedUnit = clicked?.closest(
        "[data-myz-unit]",
      ) as HTMLElement | null;
      const sideHint =
        (bodyRef.value?.querySelector(
          `.myz-snapshot-fold-hint[data-gap="${gap}"][data-side="${side}"]`,
        ) as HTMLElement | null) ?? null;
      const anchorEl = regionVisible ? region : (clickedUnit ?? sideHint);
      ensureGap(gap);
      const state = gaps[gap];
      revealWithAnchor(
        gap,
        {
          ...state,
          upRev: side === "up" ? state.upRev + 1 : state.upRev,
          downRev: side === "down" ? state.downRev + 1 : state.downRev,
        },
        anchorEl,
      );
    }

    /**
     * Full unfold (the 「…」 glyph): anchor on the visible highlight record —
     * the one above preferred (the earlier record), else the one below — so
     * the records show how far the snapshot has opened (2026-11-24).
     */
    function revealAll(gap: number) {
      const up = outerRegion(gap, "up");
      const down = outerRegion(gap, "down");
      const visible = (el: Element | null) =>
        Boolean(el && isInReadingViewport(el));
      const anchorEl = visible(up) ? up : visible(down) ? down : (up ?? down);
      ensureGap(gap);
      revealWithAnchor(
        gap,
        { ...gaps[gap], expanded: true },
        anchorEl as HTMLElement | null,
      );
    }

    /**
     * Click handling on the body: a mark click selects that record (the
     * snapshot is the navigation surface); a seam half unfolds one block
     * toward that side (the view follows); the 「…」 glyph unfolds the run.
     */
    async function onBodyClick(event: MouseEvent) {
      // A drag-select must not toggle: only an actual click reveals.
      if (!window.getSelection()?.isCollapsed) return;
      const element = event.target as HTMLElement | null;

      // 页边批注图标：点击弹出 popover；点别处关闭。
      const icon = element?.closest(
        ".myz-snapshot-note-icon",
      ) as HTMLElement | null;
      if (icon && bodyRef.value?.contains(icon)) {
        const id = icon.getAttribute("data-note-for") || "";
        const text = notes.value[id];
        if (text) {
          const rect = icon.getBoundingClientRect();
          const y = Math.max(8, Math.min(rect.top, window.innerHeight - 120));
          noteOpener = icon;
          notePopover.value = {
            id,
            text,
            x: Math.min(rect.right + 8, window.innerWidth - 288),
            y,
            // 长批注不越过视口：剩余高度就是 popover 的上限，正文内部滚动
            // （CodeRabbit #136）。
            maxHeight: Math.max(120, window.innerHeight - y - 12),
          };
          // Keyboard users land in the dialog instead of tabbing through every
          // remaining icon first (CodeRabbit #136).
          await nextTick();
          noteCloseRef.value?.focus();
        }
        return;
      }
      if (notePopover.value) {
        // An outside click already moved focus where the user wanted it.
        closeNotePopover();
        return;
      }

      const mark = element?.closest("mark[data-myz-anchor]");
      const markId = mark?.getAttribute("data-myz-anchor");
      if (markId && props.onSelectRecord) {
        props.onSelectRecord(markId);
        return;
      }
      handleRevealActivate(element);
    }

    /** Keyboard twin of the click (Enter / Space), per APG button semantics. */
    function onBodyKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (notePopover.value) {
          event.preventDefault();
          // Escape came from the keyboard: put focus back on the icon.
          closeNotePopover({ restoreFocus: true });
        }
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest(
          ".myz-snapshot-tear-half, .myz-snapshot-tear-glyph, .myz-snapshot-fold-hint",
        )
      )
        return;
      event.preventDefault();
      handleRevealActivate(target);
    }

    function handleRevealActivate(element: HTMLElement | null) {
      // 缝的上下半区、以及模糊提示，都是同一个动作：向该侧揭开下一个块。
      const target = element?.closest(
        ".myz-snapshot-tear-half, .myz-snapshot-fold-hint",
      ) as HTMLElement | null;
      if (target && bodyRef.value?.contains(target)) {
        const gap = Number(target.getAttribute("data-gap") || "-1");
        const seam = target.closest(".myz-snapshot-tear") as HTMLElement | null;
        // An edge seam has only one annotated neighbour; both halves open
        // toward that neighbour (below the leading run, above the trailing).
        const upRegion = Number(seam?.getAttribute("data-up-region") ?? "-1");
        const downRegion = Number(
          seam?.getAttribute("data-down-region") ?? "-1",
        );
        const edgeSide =
          seam && (upRegion === -1 || downRegion === -1)
            ? upRegion === -1
              ? "down"
              : "up"
            : null;
        const side = edgeSide ?? target.getAttribute("data-side");
        if (gap >= 0 && (side === "up" || side === "down")) {
          revealStep(gap, side, target);
        }
        return;
      }
      const glyph = element?.closest(
        ".myz-snapshot-tear-glyph",
      ) as HTMLElement | null;
      if (glyph && bodyRef.value?.contains(glyph)) {
        revealAll(Number(glyph.getAttribute("data-gap") || "-1"));
        return;
      }
      // The 「…」 row is a band of its own: its free space (either side of the
      // glyph) is the same "unfold the whole run" action, not dead pixels —
      // and never a band's action (the rows do not overlap, 2026-11-24).
      const tear = element?.closest(".myz-snapshot-tear") as HTMLElement | null;
      if (tear && bodyRef.value?.contains(tear)) {
        revealAll(Number(tear.getAttribute("data-gap") || "-1"));
      }
    }

    /** Brings the active record's mark into view (the region it lives in). */
    async function focusActiveMark() {
      await nextTick();
      bodyRef.value
        ?.querySelector("mark.is-active")
        ?.scrollIntoView({ block: "center" });
    }

    watch(
      () => [props.activeId, snapshot.value?.id],
      () => void focusActiveMark(),
    );

    return () => (
      <div
        class="myz-snapshot-view mt-4 flex min-h-0 flex-col gap-2"
        data-testid="snapshot-view"
      >
        {snapshot.value ? (
          <div
            class="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-2 text-caption"
            data-testid="snapshot-header"
          >
            <span class="text-text">
              {snapshotHeaderLine(snapshot.value.createdAt)}
            </span>
            <a
              class="underline"
              href={snapshot.value.url}
              target="_blank"
              rel="noreferrer"
              data-testid="snapshot-open-original"
            >
              打开原页
            </a>
          </div>
        ) : null}
        <p class="text-caption text-muted" data-testid="snapshot-status">
          {statusLine.value}
        </p>
        {loading.value ? (
          <p class="text-compact text-muted">正在读取快照…</p>
        ) : error.value ? (
          <p class="text-compact text-muted" role="status">
            {error.value}
          </p>
        ) : snapshot.value ? (
          <>
            {placements.value.length ? (
              <p class="text-caption text-muted" data-testid="snapshot-summary">
                本页 {placements.value.length} 条记录：{locatedCount.value}{" "}
                条已标注
                {unlocatedCount.value
                  ? `，${unlocatedCount.value} 条未能定位`
                  : ""}
              </p>
            ) : null}
            {activePlacement.value?.anchor.status === "unlocated" ? (
              <div
                class="rounded-control border border-warn/40 bg-warn-bg px-3 py-2 text-caption text-warn"
                role="status"
                data-testid="snapshot-unlocated"
              >
                <p>
                  这条高亮未能在快照中定位：
                  {activePlacement.value.anchor.reason}
                </p>
                {snapshot.value.url ? (
                  <a
                    class="underline"
                    href={snapshot.value.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开原页看它原本的位置
                  </a>
                ) : null}
              </div>
            ) : null}
            <article
              ref={bodyRef}
              class="prose myz-snapshot-body"
              data-testid="snapshot-body"
              onClick={onBodyClick}
              onKeydown={onBodyKeydown}
              innerHTML={body.value}
            ></article>
            {notePopover.value ? (
              <div
                class="myz-snapshot-note-popover"
                role="dialog"
                aria-label="批注"
                data-testid="note-popover"
                style={`left:${notePopover.value.x}px;top:${notePopover.value.y}px;max-height:${notePopover.value.maxHeight}px`}
                onKeydown={(event: KeyboardEvent) => {
                  // Focus can leave the article (the close button), so the
                  // popover carries its own Escape (CodeRabbit #136).
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  closeNotePopover({ restoreFocus: true });
                }}
              >
                <p class="myz-snapshot-note">{notePopover.value.text}</p>
                <button
                  ref={noteCloseRef}
                  type="button"
                  class="myz-snapshot-note-close"
                  aria-label="关闭批注"
                  data-testid="note-popover-close"
                  onClick={() => closeNotePopover({ restoreFocus: true })}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p class="text-compact text-muted" data-testid="snapshot-empty">
            这一页还没有快照。在网页上打开它，点「保存快照」。
          </p>
        )}
      </div>
    );
  },
});
