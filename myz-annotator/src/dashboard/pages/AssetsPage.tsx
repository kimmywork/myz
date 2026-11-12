import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { SelectionBar, StatePanel, UndoBar } from "@myz/dashboard-ui";
import { computed, defineComponent, onMounted, ref } from "vue";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";
import { useLibrarySelection } from "../composables/useLibrarySelection.js";
import { formatDateTime } from "../utils/records.js";
import { AssetPreview } from "./assets/AssetPreview.jsx";
import { useAssetsRemoval } from "./assets/use-assets-removal.js";
import {
  assetKindLabel,
  assetSourceLabel,
  formatBytes,
  useStagedAssets,
} from "./assets/use-staged-assets.js";

/**
 * 素材 (I6): the capture cache, finally visible in the dashboard instead of
 * only behind the stitch editor's picker. Local-only, never synced (§4.33).
 *
 * Two delete paths share one I4 session: a single card, or the current
 * selection as one group — one undo bar, one click restores the whole batch.
 * Selection follows I5's view rules (it lives in this page).
 */
export default defineComponent({
  name: "AssetsPage",
  setup() {
    const state = useStagedAssets();
    // No filters on this page: the selection lives as long as the page does.
    const selection = useLibrarySelection(computed(() => "assets"));
    const preview = ref<StagedAssetMeta | null>(null);
    const busy = ref(false);

    const removal = useAssetsRemoval(async () => {
      await state.reload();
    });

    const visible = computed(() =>
      state.assets.value.filter(
        (asset) => !removal.hiddenIds.value.has(asset.id),
      ),
    );
    const visibleIds = computed(() => visible.value.map((asset) => asset.id));
    const selected = computed(() =>
      state.assets.value.filter(
        (asset) =>
          selection.has(asset.id) && !removal.hiddenIds.value.has(asset.id),
      ),
    );

    async function reload() {
      await state.reload();
      selection.prune(new Set(state.assets.value.map((asset) => asset.id)));
    }

    async function removeOne(asset: StagedAssetMeta) {
      if (busy.value) return;
      busy.value = true;
      try {
        await removal.remove([asset]);
      } finally {
        busy.value = false;
      }
    }

    async function removeSelected() {
      const batch = selected.value;
      if (!batch.length || busy.value) return;
      busy.value = true;
      try {
        await removal.remove(batch);
        selection.clear(batch.map((asset) => asset.id));
      } finally {
        busy.value = false;
      }
    }

    onMounted(() => void reload());

    return () => (
      <DashboardWorkspaceLayout>
        {{
          nav: () => null,
          default: () => (
            <div class="flex min-h-0 flex-col gap-3 p-4">
              <header class="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                <div class="min-w-0">
                  <h2 class="text-heading font-semibold text-text">素材</h2>
                  <p class="text-compact text-muted">
                    采集到的图片、截图和视频帧，只存在本机。
                  </p>
                </div>
                <p class="text-caption text-muted" data-testid="assets-usage">
                  {state.usageText.value}
                </p>
              </header>

              {removal.undoMessage.value ? (
                <UndoBar
                  message={removal.undoMessage.value}
                  onUndo={() => void removal.undo()}
                  onPause={removal.pause}
                  onResume={removal.resume}
                />
              ) : null}

              {removal.failureMessage.value ? (
                <p
                  class="text-caption text-muted"
                  role="status"
                  aria-live="polite"
                >
                  {removal.failureMessage.value}
                </p>
              ) : null}

              {selection.count.value > 0 ? (
                <SelectionBar
                  count={selection.count.value}
                  total={visible.value.length}
                  allSelected={selection.isAllSelected(visibleIds.value)}
                  onToggleAll={() => selection.toggleAll(visibleIds.value)}
                  onClear={() => selection.clear()}
                >
                  {{
                    actions: () => (
                      <button
                        type="button"
                        class="btn btn-small btn-danger"
                        onClick={() => void removeSelected()}
                      >
                        批量删除
                      </button>
                    ),
                  }}
                </SelectionBar>
              ) : null}

              {state.loading.value ? (
                <StatePanel kind="loading" title="正在读取缓存区…" />
              ) : state.error.value ? (
                <StatePanel
                  kind="error"
                  title={state.error.value}
                  actionLabel="重试"
                  onAction={() => void reload()}
                />
              ) : !visible.value.length ? (
                <StatePanel
                  kind="empty"
                  title="缓存区还是空的"
                  hint="在网页上右键图片选「保存图片到 MyZ」，或在视频上截一帧，就会出现在这里"
                />
              ) : (
                <ul
                  class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                  data-testid="asset-grid"
                >
                  {visible.value.map((asset) => (
                    <li
                      key={asset.id}
                      class="overflow-hidden rounded-panel border border-line bg-surface"
                      data-testid="asset-card"
                      data-id={asset.id}
                    >
                      <div class="relative">
                        <button
                          type="button"
                          class="block w-full"
                          onClick={() => (preview.value = asset)}
                          aria-label={`预览 ${asset.name}`}
                        >
                          <img
                            src={asset.thumb}
                            alt={asset.name}
                            class="h-32 w-full bg-bg object-cover"
                            draggable={false}
                          />
                        </button>
                        <input
                          type="checkbox"
                          class="absolute left-2 top-2 h-4 w-4"
                          checked={selection.has(asset.id)}
                          onChange={() => selection.toggle(asset.id)}
                          aria-label={`选择：${asset.name}`}
                          data-testid="select-asset"
                        />
                        <span class="absolute right-2 top-2 rounded-tag bg-surface px-1.5 text-tag font-semibold text-text">
                          {assetKindLabel(asset.sourceKind)}
                        </span>
                      </div>
                      <div class="space-y-1 p-2">
                        <p
                          class="truncate text-compact font-semibold text-text"
                          title={asset.name}
                        >
                          {asset.name}
                        </p>
                        <p class="text-caption text-muted">
                          {assetSourceLabel(asset)} ·{" "}
                          {formatDateTime(asset.createdAt)}
                        </p>
                        <p class="text-caption text-muted">
                          {asset.width}×{asset.height} ·{" "}
                          {formatBytes(asset.size)}
                        </p>
                        <button
                          type="button"
                          class="btn btn-small btn-danger mt-1"
                          onClick={() => void removeOne(asset)}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {preview.value ? (
                <AssetPreview
                  asset={preview.value}
                  onClose={() => (preview.value = null)}
                />
              ) : null}
            </div>
          ),
        }}
      </DashboardWorkspaceLayout>
    );
  },
});
