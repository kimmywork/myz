import type { PageSnapshot } from "@myz/core/page-snapshot";
import { snapshotHeaderLine } from "@myz/core/page-snapshot";
import { computed, defineComponent, nextTick, ref, watch } from "vue";
import type { PropType } from "vue";
import { resolveSnapshotAnchor } from "./snapshot-anchor.js";
import {
  renderSnapshotBody,
  snapshotTextOf,
  type SnapshotMark,
} from "./snapshot-body.js";
import {
  buildSnapshotDisplay,
  type SnapshotGapState,
} from "./snapshot-collapse.js";
import { invoke } from "@/messaging/invoke.js";

/** The only record fields the anchoring needs. */
type PageRecordRef = {
  id: string;
  text?: string;
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
    /** Other captures of the same page, newest first (§I9). */
    const versions = ref<PageSnapshot[]>([]);
    /** Which version is on screen; the newest by default. */
    const selectedVersion = ref(0);
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
        selectedVersion.value = 0;
        gaps.value = [];
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
      const text = snapshotTextOf(snapshot.value.html);
      return props.records.map((record) => ({
        id: record.id,
        text: record.text || "",
        anchor: resolveSnapshotAnchor(record.text, text),
      }));
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

    /** Notes by record id, shown in the page-margin comment popover. */
    const notes = computed<Record<string, string>>(() => {
      const map: Record<string, string> = {};
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
    } | null>(null);

    function closeNotePopover() {
      notePopover.value = null;
    }

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
     * its halves unfold a block at a time outward, the glyph unfolds all.
     */
    const gaps = ref<SnapshotGapState[]>([]);

    /** Marked body in the fold form: sharp highlights, folded context. */
    const body = computed(() => {
      if (!snapshot.value) return "";
      const marked = renderSnapshotBody(snapshot.value, locatedMarks.value);
      return buildSnapshotDisplay(
        marked,
        props.activeId,
        notes.value,
        gaps.value,
      );
    });

    /** Ensures the state array reaches index `gap` (a click may lead). */
    function ensureGap(gap: number): SnapshotGapState[] {
      const next = gaps.value.slice();
      while (next.length <= gap) {
        next.push({ upRev: 0, downRev: 0, expanded: false });
      }
      return next;
    }

    /**
     * Keeps an anchor at its exact screen position across a re-render
     * (2026-11-24 定位规则): the clicked spot stays put while the content
     * unfolds away from it. Compensates the workspace scroll container.
     */
    async function keepAnchor(
      before: number | null,
      afterSelector: string,
      apply: () => void,
    ) {
      const container = bodyRef.value?.closest(
        ".myz-workspace__body",
      ) as HTMLElement | null;
      apply();
      await nextTick();
      if (before === null || !container || !afterSelector) return;
      const after = bodyRef.value?.querySelector(
        afterSelector,
      ) as HTMLElement | null;
      if (!after) return;
      const delta = after.getBoundingClientRect().top - before;
      if (Math.abs(delta) > 1) {
        // Instant: a smooth glide would move the anchor mid-flight, violating
        // 「点击部分的位置始终保持不变」 (2026-11-24). The reveal itself fades
        // in — that is where the motion lives.
        container.scrollBy({ top: delta });
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
      const regionVisible = (() => {
        if (!region) return false;
        const rect = region.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      })();
      // Rule 4 (2026-11-24): A/G off-screen → the clicked element is the
      // anchor (a hint is a whole block; a seam-half anchors its seam).
      const clickedAnchor = (clicked?.closest(".myz-snapshot-tear") ??
        clicked) as HTMLElement | null;
      const anchorEl = regionVisible ? region : clickedAnchor;
      const before = anchorEl?.getBoundingClientRect().top ?? null;
      // Hint and revealed are the same DOM node (one block, unblurred): the
      // stable unit id re-finds it after the re-render; the seam uses its
      // `data-tear` id.
      const unitId = anchorEl?.getAttribute("data-myz-unit") ?? "";
      const anchorSelector = unitId
        ? `[data-myz-unit="${unitId}"]`
        : `[data-tear="gap-${gap}"]`;
      const next = ensureGap(gap);
      const state = next[gap];
      next[gap] = {
        ...state,
        upRev: side === "up" ? state.upRev + 1 : state.upRev,
        downRev: side === "down" ? state.downRev + 1 : state.downRev,
      };
      void keepAnchor(before, anchorSelector, () => {
        gaps.value = next;
      });
    }

    /**
     * Full unfold (the 「…」 glyph): anchor on the visible highlight record —
     * the one above preferred (the earlier record), else the one below — so
     * the records show how far the snapshot has opened (2026-11-24).
     */
    function revealAll(gap: number) {
      const up = outerRegion(gap, "up");
      const down = outerRegion(gap, "down");
      const viewportBottom = window.innerHeight;
      const visible = (el: Element | null) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportBottom;
      };
      const anchorEl = visible(up) ? up : visible(down) ? down : (up ?? down);
      const before = anchorEl?.getBoundingClientRect().top ?? null;
      const unitId = anchorEl?.getAttribute("data-myz-unit") ?? "";
      const next = ensureGap(gap);
      next[gap] = {
        upRev: next[gap].upRev,
        downRev: next[gap].downRev,
        expanded: true,
      };
      void keepAnchor(
        before,
        unitId ? `[data-myz-unit="${unitId}"]` : "",
        () => {
          gaps.value = next;
        },
      );
    }

    /**
     * Click handling on the body: a mark click selects that record (the
     * snapshot is the navigation surface); a seam half unfolds one block
     * toward that side (the view follows); the 「…」 glyph unfolds the run.
     */
    function onBodyClick(event: MouseEvent) {
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
          notePopover.value = {
            id,
            text,
            x: Math.min(rect.right + 8, window.innerWidth - 288),
            y: Math.min(rect.top, window.innerHeight - 160),
          };
        }
        return;
      }
      if (notePopover.value) {
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
          closeNotePopover();
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
        const side = target.getAttribute("data-side");
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
      }
    }

    /** Switches to another capture of the same page. */
    function selectVersion(index: number) {
      const chosen = versions.value[index];
      if (!chosen) return;
      selectedVersion.value = index;
      snapshot.value = chosen;
      gaps.value = [];
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
        {versions.value.length > 1 ? (
          <div
            class="flex flex-wrap items-center gap-2 text-caption"
            role="group"
            aria-label="快照版本"
            data-testid="snapshot-versions"
          >
            <span class="text-muted">共 {versions.value.length} 个版本：</span>
            {versions.value.map((version, index) => (
              <button
                key={version.id}
                type="button"
                class={[
                  "rounded-tag border border-line px-2 py-0.5",
                  index === selectedVersion.value
                    ? "bg-accent text-on-accent"
                    : "text-muted",
                ].join(" ")}
                aria-pressed={index === selectedVersion.value}
                data-testid={`snapshot-version-${index}`}
                onClick={() => selectVersion(index)}
              >
                {snapshotHeaderLine(version.createdAt).replace("快照 ", "")}
              </button>
            ))}
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
                style={`left:${notePopover.value.x}px;top:${notePopover.value.y}px`}
              >
                <p class="myz-snapshot-note">{notePopover.value.text}</p>
                <button
                  type="button"
                  class="myz-snapshot-note-close"
                  aria-label="关闭批注"
                  data-testid="note-popover-close"
                  onClick={closeNotePopover}
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
