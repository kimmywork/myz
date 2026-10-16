import { Check, Images, RotateCcw, Trash2 } from "@lucide/vue";
import { defineComponent, onMounted, ref } from "vue";
import { formatAssetSize, type StagedAssetKind } from "../staged-asset";
import { useStagingStore } from "../stores/staging";
import { Button } from "./ui";

const KIND_LABEL: Record<StagedAssetKind, string> = {
  image: "网页图片",
  "video-frame": "视频帧",
  screenshot: "截图",
};

/**
 * Capture-cache browser. The user multi-selects cached images and imports them
 * into the editor; the heavy `dataUrl` is only fetched on import.
 */
export default defineComponent({
  name: "StitchStagingPicker",
  emits: ["import"],
  setup(_props, { emit }) {
    const staging = useStagingStore();
    const selected = ref<Set<string>>(new Set());

    onMounted(() => void staging.refresh());

    function toggle(id: string) {
      const next = new Set(selected.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selected.value = next;
    }

    function selectAll() {
      // Insert oldest-first so a full import lands in capture order.
      selected.value = new Set(
        [...staging.items].reverse().map((item) => item.id),
      );
    }

    function clearSelection() {
      selected.value = new Set();
    }

    async function removeItem(id: string, event: MouseEvent) {
      event.stopPropagation();
      await staging.removeStaged(id);
      const next = new Set(selected.value);
      next.delete(id);
      selected.value = next;
    }

    async function clearAll() {
      if (!staging.items.length) return;
      if (!window.confirm("清空缓存区的全部图片？此操作不可撤销。")) return;
      await staging.clearStaged();
      clearSelection();
    }

    function confirmImport() {
      // Preserve the order the user selected them (Set insertion order), not the
      // staging list order (newest-first), so the editor tray matches intent.
      const ids = [...selected.value];
      if (ids.length) emit("import", ids);
    }

    return () => {
      const items = staging.items;
      const selectedCount = items.filter((item) =>
        selected.value.has(item.id),
      ).length;
      return (
        <div class="staging">
          <header class="staging-head">
            <div class="staging-title">
              <Images size={20} />
              <div>
                <h1>图片缓存区</h1>
                <p class="muted-note">
                  选择要拼接 / 合成的图片。截图、网页图片与视频帧都会留在这里。
                </p>
              </div>
            </div>
            <div class="staging-head-actions">
              <Button
                variant="ghost"
                icon={<RotateCcw size={15} />}
                onClick={() => void staging.refresh()}
              >
                刷新
              </Button>
              <Button
                variant="ghost"
                icon={<Trash2 size={15} />}
                disabled={!items.length}
                onClick={() => void clearAll()}
              >
                清空
              </Button>
            </div>
          </header>

          {staging.loading ? (
            <div class="staging-state">
              <span class="spinner" />
              正在读取缓存区…
            </div>
          ) : staging.error ? (
            <div class="staging-state staging-state-error">{staging.error}</div>
          ) : items.length === 0 ? (
            <div class="staging-state">
              <span class="dropzone-emoji">🗂️</span>
              <strong>缓存区还是空的</strong>
              <span class="muted-note">
                在网页上右键图片选「保存图片到
                MyZ」，或在视频上选「截取当前视频帧到
                MyZ」，也可以在编辑器里直接导入本地图片。
              </span>
            </div>
          ) : (
            <>
              <div class="staging-toolbar">
                <button type="button" class="link" onClick={selectAll}>
                  全选
                </button>
                <button
                  type="button"
                  class="link"
                  onClick={clearSelection}
                  disabled={selectedCount === 0}
                >
                  取消选择
                </button>
                <span class="muted-note">
                  已选 {selectedCount} 张 · 按选择顺序导入
                </span>
              </div>
              <div class="staging-grid">
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    class={[
                      "staging-item",
                      selected.value.has(item.id) ? "is-selected" : "",
                    ]}
                    onClick={() => toggle(item.id)}
                  >
                    <img src={item.thumb} alt={item.name} draggable={false} />
                    <span class="staging-item-kind">
                      {KIND_LABEL[item.sourceKind]}
                    </span>
                    <span class="staging-item-meta">
                      {item.width}×{item.height} · {formatAssetSize(item.size)}
                    </span>
                    {selected.value.has(item.id) ? (
                      <span class="staging-item-check">
                        <Check size={14} />
                      </span>
                    ) : null}
                    <span
                      class="staging-item-remove"
                      role="button"
                      title="删除"
                      onClick={(event: MouseEvent) =>
                        void removeItem(item.id, event)
                      }
                    >
                      <Trash2 size={14} />
                    </span>
                  </button>
                ))}
              </div>
              <footer class="staging-foot">
                <Button
                  variant="primary"
                  block
                  disabled={selectedCount === 0}
                  onClick={confirmImport}
                >
                  {selectedCount
                    ? `导入所选 ${selectedCount} 张，进入编辑`
                    : "先选择图片"}
                </Button>
              </footer>
            </>
          )}
        </div>
      );
    };
  },
});
