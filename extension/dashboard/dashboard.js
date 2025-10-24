const groupsEl = document.getElementById("highlight-groups");
const groupTemplate = document.getElementById("group-template");
const cardTemplate = document.getElementById("card-template");
const listRowTemplate = document.getElementById("list-row-template");

const searchInput = document.getElementById("filter-search");
const siteSelect = document.getElementById("filter-site");
const tagSelect = document.getElementById("filter-tags");
const fromInput = document.getElementById("filter-from");
const toInput = document.getElementById("filter-to");
const resetFiltersBtn = document.getElementById("reset-filters");
const summaryEl = document.getElementById("summary");
const exportMarkdownBtn = document.getElementById("export-markdown");
const exportJsonBtn = document.getElementById("export-json");
const saveSettingsBtn = document.getElementById("save-settings");
const syncLogseqBtn = document.getElementById("sync-logseq");
const logseqStatusEl = document.getElementById("logseq-status");
const logseqEndpointInput = document.getElementById("logseq-endpoint");
const logseqTokenInput = document.getElementById("logseq-token");
const viewCardsBtn = document.getElementById("view-cards");
const viewListBtn = document.getElementById("view-list");
const pickerButtons = document.querySelectorAll("[data-picker-for]");

const state = {
  highlights: [],
  filtered: [],
  filters: {
    search: "",
    site: "",
    tags: [],
    from: "",
    to: ""
  },
  view: "cards",
  searchTerms: []
};

init().catch((error) => {
  console.error("Dashboard init failed", error);
  groupsEl.innerHTML = `<p class="empty-state">加载失败：${error.message}</p>`;
});

async function init() {
  bindEvents();
  updateViewToggle();
  await Promise.all([loadHighlights(), loadSettings()]);
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value.trim().toLowerCase();
    applyFilters();
  });
  siteSelect.addEventListener("change", () => {
    state.filters.site = siteSelect.value;
    applyFilters();
  });
  tagSelect.addEventListener("change", () => {
    state.filters.tags = Array.from(tagSelect.selectedOptions).map((option) => option.value);
    applyFilters();
  });
  fromInput.addEventListener("change", () => {
    state.filters.from = fromInput.value;
    applyFilters();
  });
  toInput.addEventListener("change", () => {
    state.filters.to = toInput.value;
    applyFilters();
  });
  resetFiltersBtn.addEventListener("click", resetFilters);

  exportMarkdownBtn.addEventListener("click", () => handleExport("markdown"));
  exportJsonBtn.addEventListener("click", () => handleExport("json"));

  saveSettingsBtn.addEventListener("click", saveSettings);
  syncLogseqBtn.addEventListener("click", syncLogseq);

  groupsEl.addEventListener("click", handleCardAction);

  pickerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.pickerFor;
      if (!targetId) {
        return;
      }
      const input = document.getElementById(targetId);
      if (!input) {
        return;
      }
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.focus();
      }
    });
  });

  viewCardsBtn.addEventListener("click", () => setView("cards"));
  viewListBtn.addEventListener("click", () => setView("list"));
}

async function loadHighlights() {
  groupsEl.innerHTML = `<p class="empty-state">正在加载…</p>`;
  try {
    const highlights = await sendMessage("myz:getAllHighlights");
    state.highlights = Array.isArray(highlights) ? highlights : [];
    populateFilterOptions(state.highlights);
    applyFilters();
  } catch (error) {
    console.error("Failed to load highlights", error);
    groupsEl.innerHTML = `<p class="empty-state">加载失败：${error.message}</p>`;
  }
}

function populateFilterOptions(highlights) {
  const sites = [...new Set(highlights.map((item) => item.hostname).filter(Boolean))].sort();
  siteSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "全部网站";
  siteSelect.appendChild(allOption);
  sites.forEach((site) => {
    const option = document.createElement("option");
    option.value = site;
    option.textContent = site;
    siteSelect.appendChild(option);
  });

  const tags = new Set();
  highlights.forEach((item) => {
    (item.tags || []).forEach((tag) => tags.add(tag));
  });
  tagSelect.innerHTML = "";
  Array.from(tags)
    .sort()
    .forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      tagSelect.appendChild(option);
    });
}

function applyFilters() {
  const { search, site, tags, from, to } = state.filters;
  const searchRaw = searchInput.value.trim();
  state.searchTerms = getSearchTerms(searchRaw);
  state.filtered = state.highlights.filter((item) => {
    if (site && item.hostname !== site) {
      return false;
    }
    if (tags.length) {
      const itemTags = new Set(item.tags || []);
      const hasAll = tags.every((tag) => itemTags.has(tag));
      if (!hasAll) {
        return false;
      }
    }
    if (from) {
      const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
      if (itemDate < from) {
        return false;
      }
    }
    if (to) {
      const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
      if (itemDate > to) {
        return false;
      }
    }
    if (search) {
      const haystack = [item.text, item.note, (item.tags || []).join(" ")]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
  renderHighlights(state.filtered);
  updateSummary();
}

function renderHighlights(highlights) {
  groupsEl.innerHTML = "";
  groupsEl.dataset.view = state.view;
  if (!highlights.length) {
    groupsEl.innerHTML = `<p class="empty-state">没有符合条件的标注。</p>`;
    return;
  }

  const grouped = groupByDate(highlights);
  const fragment = document.createDocumentFragment();
  grouped.forEach((items, date) => {
    const groupInstance = groupTemplate.content.cloneNode(true);
    const section = groupInstance.querySelector(".group");
    const title = groupInstance.querySelector(".group__title");
    const list = groupInstance.querySelector(".group__list");
    title.textContent = `${date} · ${items.length} 条标注`;

    items.forEach((item) => {
      const node = state.view === "cards" ? buildCard(item) : buildListRow(item);
      if (node) {
        list.appendChild(node);
      }
    });

    fragment.appendChild(section);
  });

  groupsEl.appendChild(fragment);
}

function buildCard(item) {
  const instance = cardTemplate.content.cloneNode(true);
  const card = instance.querySelector(".card");
  card.dataset.id = item.id;
  card.classList.remove("card--single");
  card.querySelector(".card__site").innerHTML = formatInline(item.hostname || item.url || "");
  card.querySelector(".card__date").textContent = formatDateTime(item.createdAt);

  const quoteEl = card.querySelector(".card__quote");
  quoteEl.innerHTML = formatContent(item.text);

  const noteEl = card.querySelector(".card__note");
  noteEl.classList.remove("is-empty");
  if (item.note) {
    noteEl.innerHTML = formatContent(item.note);
  } else {
    card.classList.add("card--single");
    noteEl.innerHTML = "";
  }

  const tagContainer = card.querySelector(".card__tags");
  tagContainer.classList.remove("is-empty");
  if (item.tags && item.tags.length) {
    item.tags.forEach((tag) => {
      const span = document.createElement("span");
      span.innerHTML = formatInline(tag);
      tagContainer.appendChild(span);
    });
  } else {
    tagContainer.classList.add("is-empty");
  }

  const link = card.querySelector("a.btn-link");
  link.href = item.sourceUrl || item.url;
  link.title = item.title || item.url;
  card.querySelector("button[data-action='copy']").dataset.id = item.id;
  card.querySelector("button[data-action='delete']").dataset.id = item.id;

  return instance;
}

function buildListRow(item) {
  const instance = listRowTemplate.content.cloneNode(true);
  const row = instance.querySelector(".list-row");
  row.dataset.id = item.id;

  row.querySelector(".list-row__date").textContent = formatDateTime(item.createdAt);
  row.querySelector(".list-row__site").innerHTML = formatInline(item.hostname || item.url || "");

  const quoteEl = row.querySelector(".list-row__quote");
  quoteEl.innerHTML = formatContent(item.text);

  const noteEl = row.querySelector(".list-row__note");
  noteEl.classList.remove("is-empty");
  if (item.note) {
    noteEl.innerHTML = formatContent(item.note);
  } else {
    noteEl.classList.add("is-empty");
    noteEl.innerHTML = "";
  }

  const tagContainer = row.querySelector(".list-row__tags");
  tagContainer.classList.remove("is-empty");
  if (item.tags && item.tags.length) {
    item.tags.forEach((tag) => {
      const span = document.createElement("span");
      span.innerHTML = formatInline(tag);
      tagContainer.appendChild(span);
    });
  } else {
    tagContainer.classList.add("is-empty");
  }

  const link = row.querySelector("a.btn-link");
  link.href = item.sourceUrl || item.url;
  link.title = item.title || item.url;
  row.querySelector("button[data-action='copy']").dataset.id = item.id;
  row.querySelector("button[data-action='delete']").dataset.id = item.id;

  return instance;
}

function updateSummary() {
  const total = state.filtered.length;
  const sites = new Set(state.filtered.map((item) => item.hostname).filter(Boolean));
  summaryEl.textContent = `共 ${total} 条标注 · 涉及 ${sites.size} 个站点`;
}

function resetFilters() {
  state.filters.search = "";
  state.filters.site = "";
  state.filters.tags = [];
  state.filters.from = "";
  state.filters.to = "";
  searchInput.value = "";
  siteSelect.value = "";
  Array.from(tagSelect.options).forEach((option) => (option.selected = false));
  fromInput.value = "";
  toInput.value = "";
  applyFilters();
}

function setView(view) {
  if (state.view === view) {
    return;
  }
  state.view = view;
  updateViewToggle();
  renderHighlights(state.filtered);
}

function updateViewToggle() {
  if (!viewCardsBtn || !viewListBtn) {
    return;
  }
  viewCardsBtn.classList.toggle("is-active", state.view === "cards");
  viewListBtn.classList.toggle("is-active", state.view === "list");
  groupsEl.dataset.view = state.view;
}

function formatContent(value) {
  if (!value) {
    return "";
  }
  const escaped = escapeHtml(String(value));
  const withBreaks = escaped.replace(/\r?\n/g, "<br>");
  return applySearchHighlights(withBreaks);
}

function formatInline(value) {
  if (!value) {
    return "";
  }
  return applySearchHighlights(escapeHtml(String(value)));
}

function applySearchHighlights(html) {
  if (!state.searchTerms.length || !html) {
    return html;
  }
  return state.searchTerms.reduce((output, term) => {
    const pattern = escapeRegExp(term);
    if (!pattern) {
      return output;
    }
    const regex = new RegExp(`(${pattern})`, "gi");
    return output.replace(regex, '<mark class="search-hit">$1</mark>');
  }, html);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&");
}

function getSearchTerms(input) {
  if (!input) {
    return [];
  }
  const seen = new Set();
  const terms = [];
  input
    .split(/\s+/)
    .filter(Boolean)
    .forEach((term) => {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        terms.push(term);
      }
    });
  return terms;
}

function handleCardAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (!id || !action) {
    return;
  }
  if (action === "copy") {
    copyHighlight(id);
  } else if (action === "delete") {
    deleteHighlight(id);
  }
}

async function copyHighlight(id) {
  const record = state.highlights.find((item) => item.id === id);
  if (!record) {
    return;
  }
  const markdown = recordToMarkdown(record);
  try {
    await navigator.clipboard.writeText(markdown);
    logseqStatusEl.textContent = "已复制到剪贴板";
    setTimeout(() => (logseqStatusEl.textContent = ""), 2000);
  } catch (error) {
    console.error("复制失败", error);
  }
}

async function deleteHighlight(id) {
  try {
    await sendMessage("myz:removeHighlight", { id });
    state.highlights = state.highlights.filter((item) => item.id !== id);
    applyFilters();
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

function downloadFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadSettings() {
  try {
    const settings = await sendMessage("myz:getSettings");
    if (!settings) {
      return;
    }
    logseqEndpointInput.value = settings.logseqEndpoint || "";
    logseqTokenInput.value = settings.logseqAuthToken || "";
  } catch (error) {
    console.error("Failed to load settings", error);
  }
}

async function saveSettings() {
  const payload = {
    logseqEndpoint: logseqEndpointInput.value.trim(),
    logseqAuthToken: logseqTokenInput.value.trim()
  };
  try {
    await sendMessage("myz:updateSettings", payload);
    logseqStatusEl.textContent = "设置已保存";
    setTimeout(() => (logseqStatusEl.textContent = ""), 2000);
  } catch (error) {
    logseqStatusEl.textContent = `保存失败：${error.message}`;
  }
}

async function syncLogseq() {
  logseqStatusEl.textContent = "同步中…";
  syncLogseqBtn.disabled = true;
  try {
    await sendMessage("myz:syncLogseq", { title: `MyZ Export ${new Date().toISOString()}` });
    logseqStatusEl.textContent = "同步成功";
  } catch (error) {
    logseqStatusEl.textContent = `同步失败：${error.message}`;
  } finally {
    syncLogseqBtn.disabled = false;
    setTimeout(() => (logseqStatusEl.textContent = ""), 4000);
  }
}

function groupByDate(highlights) {
  const map = new Map();
  highlights.forEach((item) => {
    const date = item.createdAt ? item.createdAt.slice(0, 10) : "未知日期";
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date).push(item);
  });
  return new Map(
    [...map.entries()].sort((a, b) => {
      if (a[0] === b[0]) {
        return 0;
      }
      return a[0] < b[0] ? 1 : -1;
    })
  );
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
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
