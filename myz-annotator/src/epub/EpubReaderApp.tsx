import { selectionBlocks } from "@myz/shared/selectionBlocks";
import { RECORD_KINDS } from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import EpubSidebar from "./components/EpubSidebar.js";
import EpubStage from "./components/EpubStage.js";
import EpubToolbar from "./components/EpubToolbar.js";
import EpubHighlightPanel from "./EpubHighlightPanel.js";
import { useEpubFrame } from "./reader/useEpubFrame.js";
import { useEpubReaderStore } from "./stores/reader-store.js";
import { openLibrary } from "@/reader/open-library.js";
import ReaderLanding from "@/reader/ReaderLanding.js";
import ReaderSelectionTools from "@/reader/ReaderSelectionTools.js";

/**
 * EPUB reader shell (EPUB plan E3): composes the toolbar, sidebar, stage,
 * capture tools and inspector. Frame lifecycle lives in `useEpubFrame`.
 */
export default defineComponent({
  name: "EpubReaderApp",
  setup() {
    const store = useEpubReaderStore();
    const { status, error, title, chapterHtml, recents } = storeToRefs(store);
    const frame = useEpubFrame(store);

    return () => (
      <div class="epub-app">
        {status.value === "ready" ? <EpubToolbar /> : null}

        {status.value === "ready" ? (
          <div class="epub-body">
            <EpubSidebar
              activeId={frame.activeId.value}
              onFocusRecord={frame.focusRecord}
            />
            <EpubStage
              title={title.value}
              chapterHtml={chapterHtml.value}
              onLoad={frame.handleFrameLoad}
              frameRef={frame.iframeRef}
            />
          </div>
        ) : null}

        {status.value === "landing" ? (
          <ReaderLanding
            title="MyZ EPUB 阅读器"
            subtitle="打开本地 EPUB，或从下方继续上次阅读。"
            openLabel="打开本地 EPUB"
            recents={recents.value.map((entry) => ({
              key: entry.sourceKey,
              title: entry.title || "未命名 EPUB",
              meta: `第 ${entry.spineIndex + 1} 章`,
            }))}
            onOpen={() => void store.openLocal()}
            onBack={openLibrary}
            onOpenRecent={(key) => {
              const entry = recents.value.find(
                (item) => item.sourceKey === key,
              );
              if (entry) void store.openRecent(entry);
            }}
          />
        ) : null}

        {status.value === "loading" ? <p class="epub-status">加载中…</p> : null}

        {status.value === "error" ? (
          <p class="epub-status epub-status--error">{error.value}</p>
        ) : null}

        {frame.selectionToolbar.value ? (
          <ReaderSelectionTools
            top={frame.selectionToolbar.value.top}
            left={frame.selectionToolbar.value.left}
            bottom={frame.selectionToolbar.value.bottom}
            blocks={
              frame.pendingRange.value
                ? selectionBlocks(frame.pendingRange.value)
                : []
            }
            onHighlight={() =>
              void frame.createFromSelection(RECORD_KINDS.HIGHLIGHT)
            }
            onClip={() => void frame.createFromSelection(RECORD_KINDS.CLIP)}
            onClose={frame.clearSelection}
          />
        ) : null}

        {frame.activeId.value ? (
          <EpubHighlightPanel
            record={store.getRecord(frame.activeId.value) ?? null}
            palette={store.colorPalette}
            tagOptions={store.tagOptions}
            onSave={(patch) => void frame.saveActive(patch)}
            onDelete={() => void frame.deleteActive()}
            onClose={() => (frame.activeId.value = null)}
          />
        ) : null}
      </div>
    );
  },
});
