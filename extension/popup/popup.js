const listEl = document.getElementById("highlight-list");
const template = document.getElementById("highlight-item-template");
const searchInput = document.getElementById("search-input");
const exportMarkdownBtn = document.getElementById("export-markdown");
const exportJsonBtn = document.getElementById("export-json");
const openDashboardBtn = document.getElementById("open-dashboard");
const pageMetaEl = document.getElementById("page-meta");

let allHighlights = [];
let filteredHighlights = [];
let activeTabId = null;
let canonicalPageUrl = null;

init().catch((error) => console.error("Popup init failed", error));

async function init() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    listEl.innerHTML = `<p class="empty-state">无法获取当前页面。</p>`;
    return;
  }
  activeTabId = tab.id;
  canonicalPageUrl = canonicalUrl(tab.url);
  pageMetaEl.textContent = `${truncate(tab.title || "")} · ${extractHostname(tab.url)}`;
  await loadHighlights();
  bindEvents();
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    filteredHighlights = filterHighlights(query);
    renderHighlights(filteredHighlights);
  });

  listEl.addEventListener("click", handleListAction);
  exportMarkdownBtn.addEventListener("click", () => handleExport("markdown"));
  exportJsonBtn.addEventListener("click", () => handleExport("json"));
  openDashboardBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

async function loadHighlights() {
  try {
    const highlights = await sendMessage("myz:getHighlightsForUrl", { url: canonicalPageUrl });
    allHighlights = Array.isArray(highlights) ? highlights : [];
    filteredHighlights = [...allHighlights];
    renderHighlights(filteredHighlights);
  } catch (error) {
    console.error("Failed to load highlights", error);
    listEl.innerHTML = `<p class="empty-state">加载失败：${error.message}</p>`;
  }
}

function renderHighlights(items) {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<p class="empty-state">当前页面还没有标注。</p>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const instance = template.content.cloneNode(true);
    const container = instance.querySelector(".highlight-item");
    container.dataset.id = item.id;
    const color = instance.querySelector(".highlight-item__color");
    color.style.background = item.color || "#ffe58f";
    instance.querySelector(".highlight-item__quote").textContent = item.text || "";
    instance.querySelector(".highlight-item__note").textContent = item.note || "";
    instance.querySelector(".highlight-item__meta").textContent = buildMeta(item);
    fragment.appendChild(instance);
  });
  listEl.appendChild(fragment);
}

function handleListAction(event) {
  const actionBtn = event.target.closest("[data-action]");
  if (!actionBtn) {
    return;
  }
  const action = actionBtn.dataset.action;
  const container = actionBtn.closest(".highlight-item");
  const id = container?.dataset.id;
  if (!id) {
    return;
  }

  if (action === "focus") {
    focusHighlight(id);
  } else if (action === "copy") {
    copyHighlight(id);
  } else if (action === "delete") {
    deleteHighlight(id);
  }
}

async function focusHighlight(id) {
  if (!activeTabId) {
    return;
  }
  chrome.tabs.sendMessage(activeTabId, { type: "myz:scrollToHighlight", payload: { id } }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("无法定位标注", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      console.warn("标注不存在", id);
    }
  });
}

async function copyHighlight(id) {
  const record = allHighlights.find((item) => item.id === id);
  if (!record) {
    return;
  }
  const markdown = recordToMarkdown(record);
  try {
    await navigator.clipboard.writeText(markdown);
  } catch (error) {
    console.error("复制失败", error);
  }
}

async function deleteHighlight(id) {
  try {
    await sendMessage("myz:removeHighlight", { id });
    allHighlights = allHighlights.filter((item) => item.id !== id);
    filteredHighlights = filteredHighlights.filter((item) => item.id !== id);
    renderHighlights(filteredHighlights);
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { type: "myz:refreshHighlights" }, () => void chrome.runtime.lastError);
    }
  } catch (error) {
    console.error("删除失败", error);
  }
}

async function handleExport(format) {
  try {
    const result = await sendMessage("myz:export");
    if (!result) {
      return;
    }
    if (format === "markdown") {
      downloadFile(result.markdown, "text/markdown", `myz-export-${Date.now()}.md`);
    } else {
      downloadFile(result.json, "application/json", `myz-export-${Date.now()}.json`);
    }
  } catch (error) {
    console.error("导出失败", error);
  }
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

function filterHighlights(query) {
  if (!query) {
    return [...allHighlights];
  }
  return allHighlights.filter((item) => {
    const haystack = [item.text, item.note, (item.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

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

function truncate(text, max = 36) {
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function recordToMarkdown(record) {
  const tags = Array.isArray(record.tags) && record.tags.length ? ` #${record.tags.join(" #")}` : "";
  const quote = (record.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const note = record.note ? `\n\n${record.note}` : "";
  const link = record.sourceUrl || record.url;
  return `- **${record.title || record.hostname || "页面"}**${tags} ([链接](${link}))\n${quote}${note}`;
}

function buildMeta(record) {
  const created = record.createdAt ? new Date(record.createdAt).toLocaleString() : "";
  const tags = Array.isArray(record.tags) && record.tags.length ? `#${record.tags.join(" #")}` : "";
  return [created, tags].filter(Boolean).join(" · ");
}
