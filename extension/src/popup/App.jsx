import { defineComponent, ref, computed, onMounted } from "vue";
import HighlightItem from "./components/HighlightItem.jsx";
import { normalizeWhitespace } from "../shared/highlightUtils.js";

import {
  RECORD_KINDS,
  normalizeRecord,
  recordToMarkdown,
} from "../dashboard/utils/records.js";

export default defineComponent({
  name: "PopupApp",
  setup() {
    const highlights = ref([]);
    const query = ref("");
    const loading = ref(true);
    const error = ref("");
    const pageMeta = ref("");
    const activeTabId = ref(null);
    const canonicalPageUrl = ref("");

    const notifyContentScript = (type) => {
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
      return highlights.value.filter((item) => {
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
        const [records, highlightState] = await Promise.all([
          sendMessage("myz:getHighlightsForUrl", {
            url: canonicalPageUrl.value,
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
                    normalized.kind === RECORD_KINDS.HIGHLIGHT &&
                    unreachableIds.has(normalized.id),
                };
              })
          : [];
        error.value = "";
      } catch (err) {
        console.error("Failed to load highlights", err);
        error.value = err?.message || "加载失败";
        highlights.value = [];
      } finally {
        loading.value = false;
      }
    };

    const handleSearch = (event) => {
      query.value = event.target.value;
    };

    const handleItemAction = async (action, record) => {
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

    const focusHighlight = (id) => {
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

    const copyHighlight = async (record) => {
      try {
        await navigator.clipboard.writeText(recordToMarkdown(record));
      } catch (err) {
        console.error("复制失败", err);
      }
    };

    const deleteHighlight = async (id) => {
      try {
        await sendMessage("myz:removeHighlight", { id });
        highlights.value = highlights.value.filter((item) => item.id !== id);
        notifyContentScript("myz:refreshHighlights");
      } catch (err) {
        console.error("删除失败", err);
      }
    };

    const downgradeHighlight = async (id) => {
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
          });
          highlights.value = highlights.value.map((item) =>
            item.id === normalized.id ? normalized : item,
          );
          notifyContentScript("myz:refreshHighlights");
        }
      } catch (err) {
        console.error("降级失败", err);
      }
    };

    const handleExport = async (format) => {
      try {
        const result = await sendMessage("myz:export");
        if (!result) {
          return;
        }
        if (format === "markdown") {
          downloadFile(
            result.markdown,
            "text/markdown",
            `myz-export-${Date.now()}.md`,
          );
        } else {
          downloadFile(
            result.json,
            "application/json",
            `myz-export-${Date.now()}.json`,
          );
        }
      } catch (err) {
        console.error("导出失败", err);
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
        canonicalPageUrl.value = canonicalUrl(tab.url);
        pageMeta.value = `${truncateText(tab.title || "")} · ${extractHostname(tab.url)}`;
        await loadHighlights();
      } catch (err) {
        console.error("Popup init failed", err);
        error.value = err?.message || "初始化失败";
        loading.value = false;
      }
    });

    return () => (
      <div>
        <header class="popup-header">
          <div class="popup-header__info">
            <h1>MyZ 标注助手</h1>
            <p class="popup-header__meta">{pageMeta.value}</p>
          </div>
          <div class="popup-header__actions">
            <button class="btn btn-primary" onClick={openDashboard}>
              管理中心
            </button>
            <button class="btn" onClick={() => handleExport("markdown")}>
              导出 Markdown
            </button>
            <button class="btn" onClick={() => handleExport("json")}>
              导出 JSON
            </button>
          </div>
        </header>
        <section class="popup-controls">
          <input
            type="search"
            placeholder="搜索当前页面的高亮、批注或保存的文字"
            value={query.value}
            onInput={handleSearch}
          />
        </section>
        <main class="highlight-list">
          {loading.value ? (
            <p class="empty-state">加载中…</p>
          ) : error.value ? (
            <p class="empty-state">加载失败：{error.value}</p>
          ) : filteredHighlights.value.length ? (
            filteredHighlights.value.map((record) => (
              <HighlightItem
                key={record.id}
                record={record}
                onAction={handleItemAction}
              />
            ))
          ) : (
            <p class="empty-state">当前页面还没有标注或保存的文字。</p>
          )}
        </main>
      </div>
    );
  },
});

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("无响应"));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || "未知错误"));
        return;
      }
      resolve(response.data);
    });
  });
}

function getPageHighlightState(tabId) {
  if (tabId == null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "myz:getHighlightState" },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null);
          return;
        }
        resolve(response.ok ? response.data || null : null);
      },
    );
  });
}

function canonicalUrl(url) {
  try {
    const instance = new URL(url);
    instance.hash = "";
    return instance.toString();
  } catch (error) {
    return url;
  }
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url;
  }
}

function truncateText(text, max = 36) {
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function downloadFile(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
