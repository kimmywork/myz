import { isHighlightRecord } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { unwrapNode } from "@myz/shared/serializer";
import { buildUrlAliases, canonicalUrl } from "@myz/shared/url";
import { useInspectorStore } from "../stores/inspector-store.ts";
import { useModalStore } from "../stores/modal-store.ts";
import { useNotificationStore } from "../stores/notification-store.ts";
import { ensureContentStyles } from "../styles.ts";
import { applyHighlight, rebuildHighlightRange } from "./apply.ts";
import {
  clearHighlightCaches,
  storeRecord,
  unreachableHighlights,
} from "./cache.ts";
import { updateHighlightIndicators } from "./indicators.ts";
import {
  markHighlightForReapply,
  persistRebuiltRange,
  removeHighlightFromPending,
  resetHighlightReapplyState,
} from "./reapply.ts";
import type {
  GetAllTagsMessageResult,
  GetHighlightsForUrlMessageResult,
} from "@/background/messages/highlights";

export async function restoreHighlights() {
  const modalStore = useModalStore();
  const inspectorStore = useInspectorStore();
  const notificationStore = useNotificationStore();
  try {
    ensureContentStyles();
    const currentUrl = window.location.href;
    const currentCanonical = canonicalUrl(currentUrl);
    const urlAliases = buildUrlAliases(currentUrl, currentCanonical);
    const [highlights, tagList] = await Promise.all([
      sendMessage<
        { url?: string; aliases?: string[] },
        GetHighlightsForUrlMessageResult
      >("myz:getHighlightsForUrl", {
        url: currentCanonical,
        aliases: urlAliases,
      }),
      sendMessage<undefined, GetAllTagsMessageResult>("myz:getAllTags").catch(
        (error) => {
          console.warn("Failed to load known tags", error);
          return null;
        },
      ),
    ]);

    if (Array.isArray(tagList)) modalStore.setModalKnownTags(tagList);

    inspectorStore.hide();
    Array.from(document.querySelectorAll(".myz-highlight")).forEach((node) =>
      unwrapNode(node),
    );
    clearHighlightCaches();
    resetHighlightReapplyState();

    const records = Array.isArray(highlights) ? highlights : [];
    let rebuiltCount = 0;
    records.forEach((record) => {
      const stored = storeRecord(record);
      if (!stored) return;
      modalStore.addModalKnownTags(stored.tags || []);
      if (isHighlightRecord(stored) && stored.range) {
        let applied = applyHighlight(stored);
        if (!applied && rebuildHighlightRange(stored)) {
          applied = true;
          rebuiltCount += 1;
          persistRebuiltRange(stored);
        }
        if (applied) {
          unreachableHighlights.delete(stored.id);
          removeHighlightFromPending(stored.id);
        } else if (stored?.id) {
          markHighlightForReapply(stored.id);
        }
      } else if (stored?.id) {
        unreachableHighlights.delete(stored.id);
        removeHighlightFromPending(stored.id);
      }
    });
    if (rebuiltCount > 0) {
      notificationStore.notify({
        message: `已按页面内容重建 ${rebuiltCount} 条划线位置。`,
      });
    }
    updateHighlightIndicators();
  } catch (error) {
    console.error("Failed to restore highlights", error);
    clearHighlightCaches();
    updateHighlightIndicators();
  }
}
