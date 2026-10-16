import { Plus, Shuffle, Trash2 } from "@lucide/vue";
import { defineComponent, ref, type PropType } from "vue";
import type { AssetItem } from "../types";

/**
 * Thumbnail tray. Drag reorders (or swaps when `selectable`). Vue port of
 * stitch-web's `AssetTray`.
 */
export default defineComponent({
  name: "StitchAssetTray",
  props: {
    assets: { type: Array as PropType<AssetItem[]>, required: true },
    selectable: { type: Boolean, default: false },
    selectedIndex: { type: Number as PropType<number | null>, default: null },
  },
  emits: ["add", "remove", "move", "select", "swap"],
  setup(props, { emit }) {
    const inputRef = ref<HTMLInputElement | null>(null);
    const dragFrom = ref<number | null>(null);
    const dragOver = ref<number | null>(null);

    return () => (
      <div class="tray">
        <div class="tray-scroll">
          <button
            type="button"
            class="tray-add"
            onClick={() => inputRef.value?.click()}
          >
            <Plus size={18} />
            <span>添加</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event: Event) => {
              const target = event.target as HTMLInputElement;
              emit("add", target.files);
              target.value = "";
            }}
          />
          {props.assets.map((asset, index) => (
            <div
              key={asset.id}
              class={[
                "tray-item",
                dragOver.value === index ? "is-target" : "",
                props.selectedIndex === index ? "is-selected" : "",
              ]}
              draggable
              onClick={() => {
                if (!props.selectable) return;
                emit("select", props.selectedIndex === index ? null : index);
              }}
              onDragstart={() => (dragFrom.value = index)}
              onDragover={(event: DragEvent) => {
                event.preventDefault();
                dragOver.value = index;
              }}
              onDragleave={() => {
                if (dragOver.value === index) dragOver.value = null;
              }}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                dragOver.value = null;
                const from = dragFrom.value;
                dragFrom.value = null;
                if (from == null || from === index) return;
                if (props.selectable) emit("swap", from, index);
                else emit("move", from, index);
              }}
              onDragend={() => {
                dragFrom.value = null;
                dragOver.value = null;
              }}
            >
              <img src={asset.url} alt={asset.name} draggable={false} />
              <span class="tray-index">{index + 1}</span>
              <button
                type="button"
                class="tray-remove"
                title="删除"
                onClick={(event: MouseEvent) => {
                  event.stopPropagation();
                  emit("remove", asset.id);
                }}
              >
                <Trash2 size={14} />
              </button>
              {props.selectable && props.selectedIndex === index ? (
                <span class="tray-swap-badge">
                  <Shuffle size={12} />
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {props.selectable ? (
          <p class="tray-hint">
            {props.selectedIndex === null
              ? "点选一张图片，再点另一张可交换位置"
              : "再点一张即可交换位置"}
          </p>
        ) : (
          <p class="tray-hint">拖动缩略图可调整顺序</p>
        )}
      </div>
    );
  },
});
