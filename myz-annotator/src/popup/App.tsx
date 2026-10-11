import { BookOpen } from "@lucide/vue";
import { StatePanel } from "@myz/dashboard-ui";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { IconFileText, IconSettings } from "@myz/shared/icons";
import { defineComponent } from "vue";
import HighlightItem from "./components/HighlightItem.jsx";
import { usePopup } from "./usePopup.js";

const ICON_BUTTON =
  "inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-control-bg text-muted transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:border-line dark:text-text";

const SEARCH_INPUT =
  "w-full rounded-control border border-line bg-surface px-3 py-2 text-compact text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:border-line dark:bg-surface-2 dark:text-text dark:placeholder:text-muted";

export default defineComponent({
  name: "PopupApp",
  setup() {
    const popup = usePopup();
    return () => (
      <div class="flex flex-col gap-4">
        <header class="popup-header rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h1 class="text-title font-semibold text-text">MyZ</h1>
              <ThemeToggle size="sm" />
            </div>
            <button
              class={ICON_BUTTON}
              aria-label="打开 PDF 阅读器"
              title="打开 PDF 阅读器"
              type="button"
              onClick={popup.openPdfReader}
            >
              <IconFileText size={20} aria-hidden="true" />
            </button>
            <button
              class={ICON_BUTTON}
              aria-label="打开 EPUB 阅读器"
              title="打开 EPUB 阅读器"
              type="button"
              onClick={popup.openEpubReader}
            >
              <BookOpen size={18} aria-hidden="true" />
            </button>
            <button
              class={ICON_BUTTON}
              aria-label="打开 Dashboard"
              type="button"
              onClick={popup.openDashboard}
            >
              <IconSettings size={20} aria-hidden="true" />
            </button>
          </div>
          <p class="mt-2 text-caption text-muted">{popup.pageMeta.value}</p>
        </header>
        <section class="popup-controls rounded-control border border-line bg-surface p-3 dark:bg-surface-2">
          <label class="sr-only" for="popup-search">
            搜索划线
          </label>
          <input
            id="popup-search"
            class={SEARCH_INPUT}
            type="search"
            placeholder="搜索当前页面的划线、批注或摘录"
            value={popup.query.value}
            onInput={popup.handleSearch}
          />
        </section>
        <main class="highlight-list flex flex-col gap-3 overflow-y-auto pr-1">
          {popup.loading.value ? (
            <StatePanel kind="loading" title="正在读取…" />
          ) : popup.error.value ? (
            <StatePanel
              kind="error"
              title={`加载失败：${popup.error.value}`}
              hint="检查当前页面后重试"
              actionLabel="重试"
              onAction={() => void popup.loadHighlights()}
            />
          ) : popup.filteredHighlights.value.length ? (
            popup.filteredHighlights.value.map((record) => (
              <HighlightItem
                key={record.id}
                record={record}
                onAction={popup.handleItemAction}
              />
            ))
          ) : (
            <StatePanel
              kind="empty"
              title="当前页面还没有划线、批注或摘录"
              hint="在网页上选中文字就能划线"
            />
          )}
        </main>
      </div>
    );
  },
});
