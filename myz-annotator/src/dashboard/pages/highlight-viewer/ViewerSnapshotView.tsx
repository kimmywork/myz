import type { PageSnapshot } from "@myz/core/page-snapshot";
import { computed, defineComponent, ref, watch } from "vue";
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

    const body = computed(() =>
      snapshot.value
        ? renderSnapshotBody(snapshot.value, props.recordText)
        : "",
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
          <article
            class="myz-snapshot-body max-h-[60vh] overflow-y-auto rounded-panel border border-line bg-surface p-5 text-compact text-text"
            // Snapshotted markup: sanitized in `renderSnapshotBody`.
            innerHTML={body.value}
          ></article>
        ) : (
          <p class="text-compact text-muted" data-testid="snapshot-empty">
            这条记录还没有快照。在网页上打开它，点「保存整页快照」。
          </p>
        )}
      </div>
    );
  },
});
