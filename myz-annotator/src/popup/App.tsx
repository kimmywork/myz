import { defineComponent, ref, computed, onMounted } from "vue";
import HighlightItem from "./components/HighlightItem.jsx";
import {
  normalizeRecord,
  recordToMarkdown,
} from "@/dashboard/utils/records.js";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";
import { normalizeWhitespace } from "@/shared/highlightUtils.js";
import { IconSettings } from "@/shared/icons.js";

import { sendMessage } from "@/shared/messaging.js";
import { RECORD_KINDS, MyZRecord } from "@/shared/types.js";
import { isRecord } from "@/shared/typeUtils";

import {
  canonicalUrl,
  extractHostname,
  truncateText,
  buildUrlAliases,
} from "@/shared/url.js";

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
            console.warn("无法定位标注", chrome.runtime.lastError.message);
            return;
          }
          if (!response?.ok) {
            console.warn("标注不存在", id);
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
        <header class="popup-header rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h1 class="text-base font-semibold text-slate-900 dark:text-white">
                MyZ 智能助理
              </h1>
              <ThemeToggle size="sm" />
            </div>
            <button
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
              aria-label="打开 Dashboard"
              type="button"
              onClick={openDashboard}
            >
              <IconSettings size={20} aria-hidden="true" />
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {pageMeta.value}
          </p>
        </header>
        <section class="popup-controls rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <label class="sr-only" for="popup-search">
            搜索标注
          </label>
          <input
            id="popup-search"
            class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500"
            type="search"
            placeholder="搜索当前页面的高亮、批注或保存的文字"
            value={query.value}
            onInput={handleSearch}
          />
        </section>
        <main class="highlight-list flex flex-col gap-3 overflow-y-auto pr-1">
          {loading.value ? (
            <p class="empty-state text-center text-sm text-slate-500 dark:text-slate-400">
              加载中…
            </p>
          ) : error.value ? (
            <p class="empty-state text-center text-sm text-rose-500">
              加载失败：{error.value}
            </p>
          ) : filteredHighlights.value.length ? (
            filteredHighlights.value.map((record) => (
              <HighlightItem
                key={record.id}
                record={record}
                onAction={handleItemAction}
              />
            ))
          ) : (
            <div class="empty-state flex flex-col items-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>当前页面还没有标注或保存的文字。</p>
            </div>
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
