import { defineComponent } from "vue";
import { storeToRefs } from "pinia";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "ImagePreviewModal",
  setup() {
    const uiStore = useUIStore();
    const { imagePreview } = storeToRefs(uiStore);

    const handleClose = () => {
      uiStore.closeImagePreview();
    };

    return () =>
      imagePreview.value.visible ? (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur"
          onClick={handleClose}
        >
          <div
            class="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <header class="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                {imagePreview.value.title || "图片预览"}
              </div>
              <button
                class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
                onClick={handleClose}
              >
                ✕
              </button>
            </header>
            <div class="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4 dark:bg-slate-950">
              <img
                src={imagePreview.value.dataUrl}
                class="max-h-[80vh] max-w-full h-auto w-auto rounded-2xl shadow"
                alt={imagePreview.value.title || "image"}
              />
            </div>
          </div>
        </div>
      ) : null;
  },
});

