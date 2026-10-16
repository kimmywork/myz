import {
  Grid3x3,
  Images,
  LayoutGrid,
  Smartphone,
  SquareStack,
  Trash2,
} from "@lucide/vue";
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type VNode,
} from "vue";
import ErrorBoundary from "./components/ErrorBoundary";
import StagingPicker from "./components/StagingPicker";
import { Button, Segmented } from "./components/ui";
import CollageMode from "./modes/CollageMode";
import ScreenshotMode from "./modes/ScreenshotMode";
import ShowcaseMode from "./modes/ShowcaseMode";
import { useAssetsStore } from "./stores/assets";
import { useStagingStore } from "./stores/staging";
import type { Mode } from "./types";

const MODE_COMPONENT = {
  screenshot: ScreenshotMode,
  collage: CollageMode,
  showcase: ShowcaseMode,
};

const MODE_OPTIONS: { value: Mode; label: string; icon: VNode }[] = [
  { value: "screenshot", label: "截图拼接", icon: <SquareStack size={15} /> },
  { value: "collage", label: "拼图", icon: <Grid3x3 size={15} /> },
  { value: "showcase", label: "展示图", icon: <Smartphone size={15} /> },
];

/**
 * Editor shell: a capture-cache picker first, then the three-mode editor.
 * Vue port of stitch-web's `App`, with the staging step added.
 */
export default defineComponent({
  name: "StitchApp",
  setup() {
    const store = useAssetsStore();
    const staging = useStagingStore();
    const phase = ref<"pick" | "edit">("pick");
    const mode = ref<Mode>("screenshot");
    const fileInput = ref<HTMLInputElement | null>(null);

    const activeComponent = computed(() => MODE_COMPONENT[mode.value]);

    function handlePaste(event: ClipboardEvent) {
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        void store.addFiles(files).then(() => (phase.value = "edit"));
      }
    }

    onMounted(() => window.addEventListener("paste", handlePaste));
    onBeforeUnmount(() => window.removeEventListener("paste", handlePaste));

    async function importFromStaging(ids: string[]) {
      const loaded = await staging.importAssets(ids);
      if (loaded.length) {
        store.addAssets(loaded);
        phase.value = "edit";
      }
    }

    function pickLocalFiles(files: FileList | File[] | null) {
      void store.addFiles(files).then(() => (phase.value = "edit"));
    }

    function clearAll() {
      if (!store.assets.length) return;
      if (!window.confirm("清空当前所有图片？此操作不可撤销。")) return;
      store.clear();
    }

    return () => {
      const editing = phase.value === "edit";
      return (
        <div class="app">
          <header class="appbar">
            <div class="appbar-inner">
              <div class="brand">
                <span class="brand-mark">
                  <LayoutGrid size={18} />
                </span>
                <span class="brand-name">MyZ 拼图</span>
              </div>
              <div class="appbar-center">
                {editing ? (
                  <Segmented
                    size="sm"
                    value={mode.value}
                    options={MODE_OPTIONS}
                    onChange={(value: string) => (mode.value = value as Mode)}
                  />
                ) : null}
              </div>
              <div class="appbar-right">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event: Event) => {
                    const target = event.target as HTMLInputElement;
                    pickLocalFiles(target.files);
                    target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  icon={<Images size={15} />}
                  onClick={() => (phase.value = "pick")}
                >
                  缓存区
                </Button>
                {editing && store.assets.length > 0 ? (
                  <button
                    type="button"
                    class="ghost-btn"
                    title="清空全部图片"
                    onClick={clearAll}
                  >
                    <Trash2 size={16} />
                    <span>清空</span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {store.error ? (
            <div class="banner banner-error">{store.error}</div>
          ) : null}
          {store.busy ? (
            <div class="banner banner-info">正在读取图片…</div>
          ) : null}

          <main class="app-main">
            {editing ? (
              <ErrorBoundary key={mode.value} label={mode.value}>
                {() => h(activeComponent.value)}
              </ErrorBoundary>
            ) : (
              <StagingPicker onImport={importFromStaging} />
            )}
          </main>

          <footer class="appfoot">
            <span>本地处理 · 图片不上传 · 截图/视频帧会自动留一份到缓存区</span>
          </footer>
        </div>
      );
    };
  },
});
