import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import type { PropType } from "vue";
import { invoke } from "@/messaging/invoke.js";

/**
 * Full-size preview for one capture (§I6). The list only carries thumbnails,
 * so the payload is fetched on open; until then the thumbnail is shown.
 * Escape or a click on the backdrop closes it.
 */
export const AssetPreview = defineComponent({
  name: "AssetPreview",
  props: {
    asset: { type: Object as PropType<StagedAssetMeta>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const src = ref(props.asset.thumb);
    const loading = ref(true);
    const failed = ref(false);

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }

    onMounted(async () => {
      window.addEventListener("keydown", onKeydown);
      try {
        const asset = await invoke("myz:getStagedAsset", {
          id: props.asset.id,
        });
        if (asset?.dataUrl) src.value = asset.dataUrl;
      } catch {
        failed.value = true;
      } finally {
        loading.value = false;
      }
    });

    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

    return () => (
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`预览 ${props.asset.name}`}
        data-testid="asset-preview"
        onClick={(event: MouseEvent) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div class="flex max-h-full max-w-4xl flex-col gap-2">
          <img
            src={src.value}
            alt={props.asset.name}
            class={[
              "max-h-[80vh] max-w-full rounded-panel bg-surface object-contain",
              loading.value ? "opacity-60" : "",
            ].join(" ")}
          />
          <div class="flex items-center justify-between gap-3 text-caption text-white">
            <span class="truncate">
              {props.asset.name} · {props.asset.width}×{props.asset.height}
              {failed.value ? " · 原图读取失败，显示缩略图" : ""}
            </span>
            <button
              type="button"
              class="rounded-control border border-white/40 px-2 py-1"
              onClick={() => props.onClose()}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  },
});
