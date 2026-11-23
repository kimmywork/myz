import type { PageSnapshot } from "@myz/core/page-snapshot";
import { snapshotHeaderLine } from "@myz/core/page-snapshot";
import { computed, defineComponent, nextTick, ref, watch } from "vue";
import type { PropType } from "vue";
import {
  normalizeAnchorText,
  resolveSnapshotAnchor,
} from "./snapshot-anchor.js";
import { renderSnapshotBody, type SnapshotMark } from "./snapshot-body.js";
import {
  splitSnapshotSections,
  withActiveAnchor,
} from "./snapshot-collapse.js";
import { invoke } from "@/messaging/invoke.js";

/** The only record fields the anchoring needs. */
type PageRecordRef = { id: string; text?: string };

const GAP_LABEL: Record<"before" | "between" | "after", string> = {
  before: "展开前文",
  between: "展开中间详情",
  after: "展开后文",
};

/**
 * The page's snapshot, read-only (§I8, revised 2026-11-23).
 *
 * Snapshots are **page-bound**: one copy per page, every record of the page
 * anchors onto it. The display is folded down to the annotated regions (user
 * decision 2026-11-23): only the marked regions stay visible, the content
 * around them collapses behind 「展开前后的详情」 affordances.
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
    /** Gap indexes the user asked to unfold. */
    const expanded = ref<Set<number>>(new Set());
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
        expanded.value = new Set();
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
     * Plain text of the stored body, for the anchor comparison.
     *
     * Block elements are separated by a space first: `textContent` glues
     * `<p>first</p><p>second</p>` into `firstsecond`, which would make a quote
     * spanning two paragraphs unmatchable.
     */
    function snapshotText(html: string): string {
      if (typeof document === "undefined") return normalizeAnchorText(html);
      const container = document.createElement("div");
      container.innerHTML = html;
      container
        .querySelectorAll(
          "p, div, li, br, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th",
        )
        .forEach((element) => {
          element.after(document.createTextNode(" "));
        });
      return normalizeAnchorText(container.textContent || "");
    }

    /**
     * Placement of every record of this page, computed from the stored body so
     * the answer is stable: either the quote occurs exactly once in the saved
     * copy or it does not, and "does not" is reported rather than guessed.
     */
    const placements = computed(() => {
      if (!snapshot.value) return [];
      const text = snapshotText(snapshot.value.html);
      return props.records.map((record) => ({
        id: record.id,
        text: record.text || "",
        anchor: resolveSnapshotAnchor(record.text, text),
      }));
    });

    const locatedMarks = computed<SnapshotMark[]>(() =>
      placements.value
        .filter((entry) => entry.anchor.status === "located" && entry.text)
        .map((entry) => ({ id: entry.id, text: entry.text })),
    );

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

    /** Marked body with the active mark emphasised, then folded to regions. */
    const sections = computed(() => {
      if (!snapshot.value) return [];
      const marked = renderSnapshotBody(snapshot.value, locatedMarks.value);
      return splitSnapshotSections(withActiveAnchor(marked, props.activeId));
    });

    /** Any located record at all: without one there is nothing to pin. */
    const hasAnnotations = computed(() => locatedMarks.value.length > 0);

    function toggleGap(index: number) {
      const next = new Set(expanded.value);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      expanded.value = next;
    }

    /** Switches to another capture of the same page. */
    function selectVersion(index: number) {
      const chosen = versions.value[index];
      if (!chosen) return;
      selectedVersion.value = index;
      snapshot.value = chosen;
      expanded.value = new Set();
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
      <div class="mt-4 flex min-h-0 flex-col gap-2" data-testid="snapshot-view">
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
              class="read-body myz-snapshot-body max-h-[60vh] overflow-y-auto rounded-panel border border-line bg-surface p-5 text-compact text-text"
              data-testid="snapshot-body"
            >
              {sections.value.map((section, index) =>
                section.kind === "annotated" ? (
                  <div
                    key={`a${index}`}
                    class="myz-snapshot-region"
                    // Sanitized + mark-wrapped in `renderSnapshotBody`.
                    innerHTML={section.html}
                  />
                ) : expanded.value.has(index) ? (
                  <div key={`g${index}`} class="myz-snapshot-gap">
                    <div innerHTML={section.html} />
                    <button
                      type="button"
                      class="myz-snapshot-gap-toggle"
                      onClick={() => toggleGap(index)}
                    >
                      收起
                    </button>
                  </div>
                ) : hasAnnotations.value ? (
                  <button
                    key={`g${index}`}
                    type="button"
                    class="myz-snapshot-gap-toggle"
                    data-testid="snapshot-expand"
                    onClick={() => toggleGap(index)}
                  >
                    {GAP_LABEL[section.position]} · 约 {section.chars} 字
                  </button>
                ) : (
                  <div key={`g${index}`} innerHTML={section.html} />
                ),
              )}
            </article>
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
