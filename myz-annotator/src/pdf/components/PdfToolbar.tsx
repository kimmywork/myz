import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Menu,
  Minus,
  Plus,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";
import BilingualControl from "@/reader/BilingualControl.js";

export default defineComponent({
  name: "PdfToolbar",
  setup() {
    const store = useReaderStore();
    const {
      status,
      page,
      pages,
      label,
      annotations,
      sidebarOpen,
      bilingualEnabled,
      bilingualPhase,
      bilingualSource,
      bilingualTarget,
      bilingualError,
      bilingualProgress,
      bilingualTranslated,
      bilingualHasTarget,
    } = storeToRefs(store);

    return () => (
      <header class="reader-toolbar">
        <div class="reader-toolbar__group">
          <button
            type="button"
            class={
              "reader-icon-btn reader-sidebar-toggle" +
              (sidebarOpen.value ? " is-active" : "")
            }
            aria-label="切换导航侧栏"
            title="目录 / 划线"
            disabled={status.value !== "ready"}
            onClick={() => (store.sidebarOpen = !store.sidebarOpen)}
          >
            <Menu size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="reader-btn"
            aria-label="上一页"
            title="上一页"
            disabled={page.value <= 1 || status.value !== "ready"}
            onClick={() => store.goToPage(page.value - 1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span class="reader-pager">
            {pages.value ? `${page.value} / ${pages.value}` : "—"}
          </span>
          <button
            type="button"
            class="reader-btn"
            aria-label="下一页"
            title="下一页"
            disabled={page.value >= pages.value || status.value !== "ready"}
            onClick={() => store.goToPage(page.value + 1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div class="reader-toolbar__title" title={label.value}>
          {label.value}
          {annotations.value.length
            ? ` · ${annotations.value.length} 条记录`
            : ""}
        </div>
        <div class="reader-toolbar__group">
          <button
            type="button"
            class="reader-icon-btn"
            aria-label="缩小"
            title="缩小"
            disabled={status.value !== "ready"}
            onClick={store.zoomOut}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span class="reader-pager reader-zoom__value">
            {store.zoomPercent()}
          </span>
          <button
            type="button"
            class="reader-icon-btn"
            aria-label="放大"
            title="放大"
            disabled={status.value !== "ready"}
            onClick={store.zoomIn}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <BilingualControl
            enabled={bilingualEnabled.value}
            phase={bilingualPhase.value}
            sourceLanguage={bilingualSource.value}
            targetLanguage={bilingualTarget.value}
            error={bilingualError.value}
            downloadPercent={Math.round(bilingualProgress.value * 100)}
            translated={bilingualTranslated.value}
            hasTarget={bilingualHasTarget.value}
            disabled={status.value !== "ready"}
            onEnable={store.enableBilingual}
            onToggle={store.toggleBilingual}
            onSelectTarget={store.setBilingualTarget}
            onRedetect={store.redetectBilingual}
            onRetry={store.retryBilingual}
          />
          <button type="button" class="reader-btn" onClick={store.openLocal}>
            <FolderOpen size={16} aria-hidden="true" />
            打开本地 PDF
          </button>
        </div>
      </header>
    );
  },
});
