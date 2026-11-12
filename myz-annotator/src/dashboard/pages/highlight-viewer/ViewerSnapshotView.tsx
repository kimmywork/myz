import type { PageSnapshot } from "@myz/core/page-snapshot";
import { snapshotHeaderLine } from "@myz/core/page-snapshot";
import { computed, defineComponent, ref, watch } from "vue";
import {
  normalizeAnchorText,
  resolveSnapshotAnchor,
} from "./snapshot-anchor.js";
import { renderSnapshotBody } from "./snapshot-body.js";
import { invoke } from "@/messaging/invoke.js";

/**
 * Read-only page snapshot for one record (§I8).
 *
 * Shows the stored body with the record's text marked, plus the one-line
 * status the contract fixes. When no snapshot exists — never taken, or taken
 * on another device — it says so plainly instead of rendering an empty page.
 */
export const ViewerSnapshotView = defineComponent({
  name: "ViewerSnapshotView",
  props: {
    recordId: { type: String, required: true },
    recordText: { type: String, default: "" },
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
    /** Only the first load per record needs a spinner. */
    const loadedFor = ref("");
    /** Monotonic id: a slower earlier load must not overwrite a newer one. */
    let requestId = 0;

    async function load() {
      const recordId = props.recordId;
      if (!recordId) return;
      const request = ++requestId;
      if (loadedFor.value !== recordId) loading.value = true;
      error.value = "";
      let replaced: PageSnapshot | null = null;
      let nextStatus = "";
      let nextVersions: PageSnapshot[] = [];
      try {
        const [found, usage] = await Promise.all([
          invoke("myz:getSnapshotForRecord", { recordId }),
          invoke("myz:getSnapshotUsage"),
        ]);
        // Navigating A → B: A's answer arriving late must not replace B's.
        if (request !== requestId) return;
        replaced = found ?? null;
        nextStatus = usage?.statusLine ?? "";
        // Versions are grouped by canonical URL: tracking parameters, a
        // fragment or a video timestamp must not look like another page.
        nextVersions = found
          ? await invoke("myz:getSnapshotVersions", { url: found.url })
          : [];
        // The second await gives another load time to start: re-check before
        // touching any reactive state, or A's versions land on B's view.
        if (request !== requestId) return;
        snapshot.value = nextVersions.length ? nextVersions[0] : replaced;
        statusLine.value = nextStatus;
        versions.value = nextVersions;
        selectedVersion.value = 0;
        loadedFor.value = recordId;
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
      () => props.recordId,
      () => void load(),
      { immediate: true },
    );

    /**
     * Plain text of a stored snapshot body, for the anchor comparison.
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
     * Whether the record's text can be placed in this snapshot.
     *
     * Computed from the stored body, not from a live page, so the answer is
     * stable: either the quote occurs exactly once in the saved copy or it does
     * not, and "does not" is reported rather than guessed around.
     */
    const anchor = computed(() => {
      if (!snapshot.value) return null;
      const text = snapshotText(snapshot.value.html);
      return resolveSnapshotAnchor(props.recordText, text);
    });

    /** Switches to another capture of the same page. */
    function selectVersion(index: number) {
      const chosen = versions.value[index];
      if (!chosen) return;
      selectedVersion.value = index;
      snapshot.value = chosen;
    }

    const body = computed(() =>
      snapshot.value && anchor.value?.status === "located"
        ? renderSnapshotBody(snapshot.value, props.recordText)
        : (snapshot.value?.html ?? ""),
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
            {anchor.value?.status === "unlocated" ? (
              <div
                class="rounded-control border border-warn/40 bg-warn-bg px-3 py-2 text-caption text-warn"
                role="status"
                data-testid="snapshot-unlocated"
              >
                <p>这条高亮未能在快照中定位：{anchor.value.reason}</p>
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
              class="myz-snapshot-body max-h-[60vh] overflow-y-auto rounded-panel border border-line bg-surface p-5 text-compact text-text"
              // Sanitized when the anchor located a spot; the untransformed
              // body still needs the same treatment, so it goes through it too.
              innerHTML={
                anchor.value?.status === "located"
                  ? body.value
                  : renderSnapshotBody({ html: snapshot.value.html }, "")
              }
            ></article>
          </>
        ) : (
          <p class="text-compact text-muted" data-testid="snapshot-empty">
            这条记录还没有快照。在网页上打开它，点「保存整页快照」。
          </p>
        )}
      </div>
    );
  },
});
