import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { normalizeWhitespace } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { recordToMarkdown } from "@myz/shared/recordDisplay";
import {
  RECORD_KINDS,
  normalizeRecord,
  type MyZRecord,
} from "@myz/shared/types";
import {
  buildUrlAliases,
  canonicalUrl,
  extractHostname,
  truncateText,
} from "@myz/shared/url";
import { computed, onMounted, ref } from "vue";
import { getActiveTab, getPageHighlightState } from "./tabs.js";
import { resolvePdfTargetUrl } from "@/pdf/detect.js";

/** State + data/actions for the popup. View lives in App.tsx. */
export function usePopup() {
  const highlights = ref<MyZRecord[]>([]);
  const query = ref("");
  const loading = ref(true);
  const error = ref("");
  const pageMeta = ref("");
  const activeTabId = ref<number | null>(null);
  const canonicalPageUrl = ref("");
  const rawPageUrl = ref("");

  const filteredHighlights = computed(() => {
    const keyword = normalizeWhitespace(query.value).toLowerCase();
    if (!keyword) return highlights.value;
    return highlights.value.filter((item: MyZRecord) => {
      const haystack = [item.text, item.note, (item.tags || []).join(" ")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  });

  function notifyContentScript(type: string) {
    if (activeTabId.value == null) return;
    chrome.tabs.sendMessage(
      activeTabId.value,
      { type },
      () => void chrome.runtime.lastError,
    );
  }

  async function loadHighlights() {
    if (!canonicalPageUrl.value) {
      highlights.value = [];
      return;
    }
    try {
      loading.value = true;
      const aliases = buildUrlAliases(rawPageUrl.value, canonicalPageUrl.value);
      const [records, highlightState] = await Promise.all([
        sendMessage("myz:getHighlightsForUrl", {
          url: canonicalPageUrl.value,
          aliases,
        }),
        getPageHighlightState(activeTabId.value),
      ]);
      const unreachableIds = new Set(
        Array.isArray(highlightState?.unreachableIds)
          ? highlightState.unreachableIds
          : [],
      );
      highlights.value = Array.isArray(records)
        ? records
            .map(normalizeRecord)
            .filter(Boolean)
            .map(
              (normalized) =>
                ({
                  ...normalized,
                  unreachable:
                    normalized?.kind === RECORD_KINDS.HIGHLIGHT &&
                    unreachableIds.has(normalized.id),
                }) as MyZRecord & { unreachable?: boolean },
            )
        : [];
      error.value = "";
    } catch (err) {
      console.error("Failed to load highlights", err);
      error.value = (err as Error)?.message || "加载失败";
      highlights.value = [];
    } finally {
      loading.value = false;
    }
  }

  function handleSearch(event: Event) {
    query.value = (event.target as HTMLInputElement).value;
  }

  function focusHighlight(id: string) {
    if (!id || activeTabId.value == null) return;
    chrome.tabs.sendMessage(
      activeTabId.value,
      { type: "myz:scrollToHighlight", payload: { id } },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("无法定位划线", chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) console.warn("划线不存在", id);
      },
    );
  }

  async function copyHighlight(record: MyZRecord) {
    try {
      await navigator.clipboard.writeText(recordToMarkdown(record));
    } catch (err) {
      console.error("复制失败", err);
    }
  }

  async function deleteHighlight(id: string) {
    if (!confirmDestructive(DELETE_CONFIRM)) return;
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlights.value = highlights.value.filter((item) => item.id !== id);
      notifyContentScript("myz:refreshHighlights");
    } catch (err) {
      console.error("删除失败", err);
    }
  }

  async function downgradeHighlight(id: string) {
    const existing = highlights.value.find((item) => item.id === id);
    if (!existing || existing.kind === RECORD_KINDS.CLIP) return;
    try {
      const updated = await sendMessage("myz:updateHighlight", {
        id,
        kind: RECORD_KINDS.CLIP,
        range: null,
        color: null,
        style: null,
      });
      if (updated) {
        const normalized = normalizeRecord({
          ...updated,
          unreachable: false,
        }) as MyZRecord;
        highlights.value = highlights.value.map((item) =>
          item.id === normalized.id ? normalized : item,
        );
        notifyContentScript("myz:refreshHighlights");
      }
    } catch (err) {
      console.error("降级失败", err);
    }
  }

  async function handleItemAction(action: string, record: MyZRecord | null) {
    if (!record) return;
    if (action === "focus") return focusHighlight(record.id);
    if (action === "copy") return copyHighlight(record);
    if (action === "delete") return deleteHighlight(record.id);
    if (action === "downgrade") await downgradeHighlight(record.id);
  }

  function openDashboard() {
    chrome.runtime.openOptionsPage();
  }

  async function openPdfReader() {
    const target = await resolvePdfTargetUrl(rawPageUrl.value);
    const base = chrome.runtime.getURL("src/pdf/pdf-viewer.html");
    const suffix = target ? `?url=${encodeURIComponent(target)}` : "";
    chrome.tabs.create({ url: `${base}${suffix}` });
  }

  function openEpubReader() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/epub/epub-viewer.html"),
    });
  }

  onMounted(async () => {
    try {
      const tab = await getActiveTab();
      if (!tab || !tab.url) {
        pageMeta.value = "无法获取当前页面";
        highlights.value = [];
        loading.value = false;
        return;
      }
      activeTabId.value = tab.id ?? null;
      rawPageUrl.value = tab.url;
      canonicalPageUrl.value = canonicalUrl(tab.url);
      pageMeta.value = `${truncateText(tab.title || "")} · ${extractHostname(tab.url)}`;
      await loadHighlights();
    } catch (err) {
      console.error("Popup init failed", err);
      error.value = (err as Error)?.message || "初始化失败";
      loading.value = false;
    }
  });

  return {
    highlights,
    query,
    loading,
    error,
    pageMeta,
    filteredHighlights,
    loadHighlights,
    handleSearch,
    handleItemAction,
    openDashboard,
    openPdfReader,
    openEpubReader,
  };
}
