import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { Dialog } from "@myz/dashboard-ui";
import { defineComponent, onMounted, ref } from "vue";
import type { PropType } from "vue";
import { invoke } from "@/messaging/invoke.js";

/**
 * Full-size preview for one capture (§I6). The list only carries thumbnails,
 * so the payload is fetched on open; until then the thumbnail is shown.
 *
 * The layer is a modal, so it uses the shared `Dialog`: focus, Tab cycling,
 * Escape and focus restore all come from the one focus trap every other modal
 * uses, instead of a local copy.
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

    onMounted(async () => {
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

    return () => (
      <Dialog
        open={true}
        width={840}
        hideCloseButton
        ariaLabel={`预览 ${props.asset.name}`}
        onClose={() => props.onClose()}
      >
        {{
          default: () => (
            <div class="flex flex-col gap-2" data-testid="asset-preview">
              <img
                src={src.value}
                alt={props.asset.name}
                class={[
                  "max-h-[70vh] w-full rounded-panel bg-bg object-contain",
                  loading.value ? "opacity-60" : "",
                ].join(" ")}
              />
              <p class="text-caption text-muted">
                {props.asset.name} · {props.asset.width}×{props.asset.height}
                {failed.value ? " · 原图读取失败，显示缩略图" : ""}
              </p>
            </div>
          ),
          footer: () => (
            <button
              type="button"
              class="btn btn-small"
              onClick={() => props.onClose()}
            >
              关闭
            </button>
          ),
        }}
      </Dialog>
    );
  },
});
