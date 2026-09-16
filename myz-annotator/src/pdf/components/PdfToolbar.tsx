import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";

export default defineComponent({
  name: "PdfToolbar",
  setup() {
    const store = useReaderStore();
    const { status, page, pages, label, annotations, sidebarOpen } =
      storeToRefs(store);

    return () => (
      <header class="reader-toolbar">
        <div class="reader-toolbar__group">
          <button
            type="button"
            class={
              "reader-sidebar-toggle" + (sidebarOpen.value ? " is-active" : "")
            }
            aria-label="切换导航侧栏"
            title="目录 / 标注"
            disabled={status.value !== "ready"}
            onClick={() => (store.sidebarOpen = !store.sidebarOpen)}
          >
            ☰
          </button>
          <button
            type="button"
            disabled={page.value <= 1 || status.value !== "ready"}
            onClick={() => store.goToPage(page.value - 1)}
          >
            上一页
          </button>
          <span class="reader-pager">
            {pages.value ? `${page.value} / ${pages.value}` : "—"}
          </span>
          <button
            type="button"
            disabled={page.value >= pages.value || status.value !== "ready"}
            onClick={() => store.goToPage(page.value + 1)}
          >
            下一页
          </button>
        </div>
        <div class="reader-toolbar__title" title={label.value}>
          {label.value}
          {annotations.value.length
            ? ` · ${annotations.value.length} 条标注`
            : ""}
        </div>
        <div class="reader-toolbar__group">
          <button
            type="button"
            class="reader-zoom"
            aria-label="缩小"
            title="缩小"
            disabled={status.value !== "ready"}
            onClick={store.zoomOut}
          >
            −
          </button>
          <span class="reader-pager reader-zoom__value">
            {store.zoomPercent()}
          </span>
          <button
            type="button"
            class="reader-zoom"
            aria-label="放大"
            title="放大"
            disabled={status.value !== "ready"}
            onClick={store.zoomIn}
          >
            +
          </button>
          <button type="button" onClick={store.openLocal}>
            打开本地 PDF
          </button>
        </div>
      </header>
    );
  },
});
