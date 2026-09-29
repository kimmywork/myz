import { BookOpen } from "@lucide/vue";
import { StatePanel } from "@myz/dashboard-ui";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { normalizeWhitespace } from "@myz/shared/highlightUtils";
import { IconFileText, IconSettings } from "@myz/shared/icons";

import { sendMessage } from "@myz/shared/messaging";
import { RECORD_KINDS, MyZRecord } from "@myz/shared/types";
import { isRecord } from "@myz/shared/typeUtils";

import {
  canonicalUrl,
  extractHostname,
  truncateText,
  buildUrlAliases,
} from "@myz/shared/url";
import { defineComponent, ref, computed, onMounted } from "vue";
import HighlightItem from "./components/HighlightItem.jsx";
import {
  normalizeRecord,
  recordToMarkdown,
} from "@/dashboard/utils/records.js";
import { resolvePdfTargetUrl } from "@/pdf/detect.js";

export default defineComponent({
  name: "PopupApp",
  setup() {
    const highlights = ref<MyZRecord[]>([]);
    const query = ref("");
    const loading = ref(true);
    const error = ref("");
    const pageMeta = ref("");
    const activeTabId = ref<number | null>(null);
    const canonicalPageUrl = ref("");
    const rawPageUrl = ref("");
    const notifyContentScript = (type: string) => {
      if (activeTabId.value == null) {
        return;
      }
      chrome.tabs.sendMessage(
        activeTabId.value,
        { type },
        () => void chrome.runtime.lastError,
      );
    };

    const filteredHighlights = computed(() => {
      const keyword = normalizeWhitespace(query.value).toLowerCase();
      if (!keyword) {
        return highlights.value;
      }
      return highlights.value.filter((item: MyZRecord) => {
        const haystack = [item.text, item.note, (item.tags || []).join(" ")]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      });
    });

    const loadHighlights = async () => {
      if (!canonicalPageUrl.value) {
        highlights.value = [];
        return;
      }
      try {
        loading.value = true;
        const aliases = buildUrlAliases(
          rawPageUrl.value,
          canonicalPageUrl.value,
        );
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
              .map((normalized) => {
                return {
                  ...normalized,
                  unreachable:
                    normalized?.kind === RECORD_KINDS.HIGHLIGHT &&
                    unreachableIds.has(normalized.id),
                } as MyZRecord & { unreachable?: boolean };
              })
          : [];
        error.value = "";
      } catch (err) {
        console.error("Failed to load highlights", err);
        error.value = (err as Error)?.message || "加载失败";
        highlights.value = [];
      } finally {
        loading.value = false;
      }
    };

    const handleSearch = (event: Event) => {
      query.value = (event.target as HTMLInputElement).value;
    };

    const handleItemAction = async (
      action: string,
      record: MyZRecord | null,
    ) => {
      if (!record) {
        return;
      }
      if (action === "focus") {
        focusHighlight(record.id);
        return;
      }
      if (action === "copy") {
        await copyHighlight(record);
        return;
      }
      if (action === "delete") {
        await deleteHighlight(record.id);
        return;
      }
      if (action === "downgrade") {
        await downgradeHighlight(record.id);
      }
    };

    const focusHighlight = (id: string) => {
      if (!id || activeTabId.value == null) {
        return;
      }
      chrome.tabs.sendMessage(
        activeTabId.value,
        { type: "myz:scrollToHighlight", payload: { id } },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("无法定位划线", chrome.runtime.lastError.message);
            return;
          }
          if (!response?.ok) {
            console.warn("划线不存在", id);
          }
        },
      );
    };

    const copyHighlight = async (record: MyZRecord) => {
      try {
        await navigator.clipboard.writeText(recordToMarkdown(record));
      } catch (err) {
        console.error("复制失败", err);
      }
    };

    const deleteHighlight = async (id: string) => {
      if (!confirmDestructive(DELETE_CONFIRM)) return;
      try {
        await sendMessage("myz:removeHighlight", { id });
        highlights.value = highlights.value.filter((item) => item.id !== id);
        notifyContentScript("myz:refreshHighlights");
      } catch (err) {
        console.error("删除失败", err);
      }
    };

    const downgradeHighlight = async (id: string) => {
      const existing = highlights.value.find((item) => item.id === id);
      if (!existing || existing.kind === RECORD_KINDS.CLIP) {
        return;
      }
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
    };

    const openDashboard = () => {
      chrome.runtime.openOptionsPage();
    };

    const openPdfReader = async () => {
      const target = await resolvePdfTargetUrl(rawPageUrl.value);
      const base = chrome.runtime.getURL("src/pdf/pdf-viewer.html");
      const query = target ? `?url=${encodeURIComponent(target)}` : "";
      chrome.tabs.create({ url: `${base}${query}` });
    };

    const openEpubReader = () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/epub/epub-viewer.html"),
      });
    };

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

    return () => (
      <div class="flex flex-col gap-4">
        <header class="popup-header rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h1 class="text-title font-semibold text-text">MyZ</h1>
              <ThemeToggle size="sm" />
            </div>
            <button
              class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-control-bg text-muted transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:border-line dark:text-text"
              aria-label="打开 PDF 阅读器"
              title="打开 PDF 阅读器"
              type="button"
              onClick={openPdfReader}
            >
              <IconFileText size={20} aria-hidden="true" />
            </button>
            <button
              class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-control-bg text-muted transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:border-line dark:text-text"
              aria-label="打开 EPUB 阅读器"
              title="打开 EPUB 阅读器"
              type="button"
              onClick={openEpubReader}
            >
              <BookOpen size={18} aria-hidden="true" />
            </button>
            <button
              class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-control-bg text-muted transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:border-line dark:text-text"
              aria-label="打开 Dashboard"
              type="button"
              onClick={openDashboard}
            >
              <IconSettings size={20} aria-hidden="true" />
            </button>
          </div>
          <p class="mt-2 text-caption text-muted">{pageMeta.value}</p>
        </header>
        <section class="popup-controls rounded-control border border-line bg-surface p-3 dark:bg-surface-2">
          <label class="sr-only" for="popup-search">
            搜索划线
          </label>
          <input
            id="popup-search"
            class="w-full rounded-control border border-line bg-surface px-3 py-2 text-compact text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:border-line dark:bg-surface-2 dark:text-text dark:placeholder:text-muted"
            type="search"
            placeholder="搜索当前页面的划线、批注或摘录"
            value={query.value}
            onInput={handleSearch}
          />
        </section>
        <main class="highlight-list flex flex-col gap-3 overflow-y-auto pr-1">
          {loading.value ? (
            <StatePanel kind="loading" title="正在读取…" />
          ) : error.value ? (
            <StatePanel
              kind="error"
              title={`加载失败：${error.value}`}
              hint="检查当前页面后重试"
              actionLabel="重试"
              onAction={() => void loadHighlights()}
            />
          ) : filteredHighlights.value.length ? (
            filteredHighlights.value.map((record) => (
              <HighlightItem
                key={record.id}
                record={record}
                onAction={handleItemAction}
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

function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function getPageHighlightState(
  tabId: number | null,
): Promise<{ unreachableIds: string[] } | null> {
  if (tabId == null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "myz:getHighlightState" },
      (response: { ok: boolean; data?: unknown }) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null);
          return;
        }
        if (!response.ok) {
          resolve(null);
          return;
        }
        const data = isRecord(response.data) ? response.data : null;
        const unreachableIds = Array.isArray(data?.unreachableIds)
          ? data.unreachableIds.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : null;
        resolve(unreachableIds ? { unreachableIds } : null);
      },
    );
  });
}
