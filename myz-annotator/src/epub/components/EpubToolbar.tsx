import { Menu } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useEpubReaderStore } from "../stores/reader-store.js";
import BilingualControl from "@/reader/BilingualControl.js";

/** EPUB top bar: sidebar toggle, chapter paging, title, progress, open local. */
export default defineComponent({
  name: "EpubToolbar",
  setup() {
    const store = useEpubReaderStore();
    const {
      title,
      spineIndex,
      spineCount,
      progressPercent,
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
      <header class="epub-toolbar">
        <button
          type="button"
          class="epub-icon-btn"
          aria-label="切换目录"
          title="目录"
          onClick={() => (store.sidebarOpen = !store.sidebarOpen)}
        >
          <Menu size={16} aria-hidden="true" />
        </button>
        <div class="epub-toolbar__group">
          <button
            type="button"
            class="epub-btn"
            disabled={spineIndex.value <= 0}
            onClick={() => store.goToChapter(spineIndex.value - 1)}
          >
            上一章
          </button>
          <span class="epub-pager">
            {spineIndex.value + 1} / {spineCount.value}
          </span>
          <button
            type="button"
            class="epub-btn"
            disabled={spineIndex.value >= spineCount.value - 1}
            onClick={() => store.goToChapter(spineIndex.value + 1)}
          >
            下一章
          </button>
        </div>
        <div class="epub-toolbar__title" title={title.value}>
          {title.value}
        </div>
        <span class="epub-pager">{progressPercent.value}%</span>
        <BilingualControl
          enabled={bilingualEnabled.value}
          phase={bilingualPhase.value}
          sourceLanguage={bilingualSource.value}
          targetLanguage={bilingualTarget.value}
          error={bilingualError.value}
          downloadPercent={Math.round(bilingualProgress.value * 100)}
          translated={bilingualTranslated.value}
          hasTarget={bilingualHasTarget.value}
          onEnable={store.enableBilingual}
          onToggle={store.toggleBilingual}
          onSelectTarget={store.setBilingualTarget}
          onRedetect={store.redetectBilingual}
          onRetry={store.retryBilingual}
        />
        <button
          type="button"
          class="epub-btn"
          onClick={() => void store.openLocal()}
        >
          打开本地 EPUB
        </button>
      </header>
    );
  },
});
