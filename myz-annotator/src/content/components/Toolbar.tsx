import {
  IconClip,
  IconCrop,
  IconHighlightPaint,
  IconLanguages,
  IconSearch,
} from "@myz/shared/icons";
import { selectionBlocks } from "@myz/shared/selectionBlocks";
import { defineComponent } from "vue";
import { useToolbarStore } from "@/content/stores/toolbar-store.js";
import { createChromeStorageTranslationCache } from "@/reader/translate/storage.js";
import { useTranslation } from "@/reader/translate/useTranslation.js";
import TranslationPopover from "@/reader/TranslationPopover.js";

export default defineComponent({
  name: "MyZToolbar",
  setup() {
    const store = useToolbarStore();
    // Content scripts share the host page's origin, so translations must not
    // be cached in the page's IndexedDB; use extension storage instead.
    const translation = useTranslation({
      cache: createChromeStorageTranslationCache(),
    });

    const handleAnnotate = (event: Event) => {
      event.preventDefault();
      store.handleAnnotateClick();
    };

    const handleClip = (event: Event) => {
      event.preventDefault();
      store.handleClipClick();
    };

    const handleCapture = (event: Event) => {
      event.preventDefault();
      store.handleScreenshotClick();
    };

    const handleTranslate = (event: Event) => {
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        store.hide();
        return;
      }
      const range = selection.getRangeAt(0);
      const blocks = selectionBlocks(range);
      if (!blocks.length) {
        store.hide();
        return;
      }
      const rect = range.getBoundingClientRect();
      translation.openFor(blocks, {
        position: {
          top: rect.top,
          left: rect.left + rect.width / 2,
          bottom: rect.bottom,
        },
      });
    };

    const handleSearch = (event: Event) => {
      event.preventDefault();
      store.handleSearchClick();
    };

    return () => (
      <>
        <div
          class={
            "myz-annotator-toolbar" +
            `${store.isVisible() && !translation.open.value ? "" : " myz-hidden"}`
          }
          style={{
            top: `${store.toolbarPosition?.top ?? "0px"}`,
            left: `${store.toolbarPosition?.left ?? "0px"}`,
          }}
        >
          <button type="button" aria-label="划线" onClick={handleAnnotate}>
            <IconHighlightPaint size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="摘录" onClick={handleClip}>
            <IconClip size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="截取" onClick={handleCapture}>
            <IconCrop size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="翻译" onClick={handleTranslate}>
            <IconLanguages size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="搜索" onClick={handleSearch}>
            <IconSearch size={16} aria-hidden="true" />
          </button>
        </div>

        {translation.open.value ? (
          <TranslationPopover
            top={translation.position.value.top}
            left={translation.position.value.left}
            bottom={translation.position.value.bottom}
            sourceText={translation.sourceText.value}
            sourceLanguage={translation.sourceLanguage.value}
            targetLanguage={translation.targetLanguage.value}
            status={translation.status.value}
            downloadPercent={translation.downloadPercent.value}
            translation={translation.translation.value}
            errorMessage={translation.errorMessage.value}
            copyError={translation.copyError.value}
            copied={translation.copied.value}
            onCopy={() => void translation.copy()}
            onRetry={translation.retry}
            onClose={translation.close}
          />
        ) : null}
      </>
    );
  },
});
