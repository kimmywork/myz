import type { PageSnapshot } from "@myz/core/page-snapshot";
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
      try {
        const [found, usage] = await Promise.all([
          invoke("myz:getSnapshotForRecord", { recordId }),
          invoke("myz:getSnapshotUsage"),
        ]);
        // Navigating A → B: A's answer arriving late must not replace B's.
        if (request !== requestId) return;
        snapshot.value = found ?? null;
        statusLine.value = usage?.statusLine ?? "";
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

    /** Plain text of a stored snapshot body, for the anchor comparison. */
    function snapshotText(html: string): string {
      if (typeof document === "undefined") return normalizeAnchorText(html);
      const container = document.createElement("div");
      container.innerHTML = html;
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

    const body = computed(() =>
      snapshot.value && anchor.value?.status === "located"
        ? renderSnapshotBody(snapshot.value, props.recordText)
        : (snapshot.value?.html ?? ""),
    );

    return () => (
      <div class="mt-4 flex min-h-0 flex-col gap-2" data-testid="snapshot-view">
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
