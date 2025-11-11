document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const tab = await getActiveTab();
    if (!tab) {
      renderEmptyState("Active tab not found.");
      return;
    }
    chrome.runtime.sendMessage({ type: "danmaku:get", tabId: tab.id }, response => {
      if (chrome.runtime.lastError) {
        renderEmptyState("Unable to load danmaku data.");
        return;
      }
      renderDanmaku(response || { list: [], count: 0, title: null });
    });
  } catch (error) {
    console.error(error);
    renderEmptyState("Unexpected error.");
  }
}

function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function renderDanmaku(data) {
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");
  const footerEl = document.getElementById("footer");

  const items = Array.isArray(data.list) ? [...data.list] : [];
  items.sort((a, b) => (a.timeSeconds || 0) - (b.timeSeconds || 0));

  const totalCount = typeof data.count === "number" ? data.count : items.length;
  countEl.textContent = `${totalCount} entries`;
  footerEl.textContent = data.title ? `Video: ${data.title}` : "";

  if (!items.length) {
    renderEmptyState("No danmaku detected yet.");
    return;
  }

  listEl.innerHTML = "";
  items.forEach(item => {
    const article = document.createElement("article");
    article.className = "danmaku-item";

    const link = document.createElement("a");
    link.href = item.permalink || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const time = document.createElement("div");
    time.className = "danmaku-time";
    time.textContent = item.timeLabel || "--:--";

    const body = document.createElement("div");
    body.className = "danmaku-body";
    body.textContent = item.body || item.rawText || "";

    const author = document.createElement("div");
    author.className = "danmaku-author";
    author.textContent = item.author ? `by ${item.author}` : "";

    link.appendChild(time);
    link.appendChild(body);
    if (author.textContent) {
      link.appendChild(author);
    }

    article.appendChild(link);
    listEl.appendChild(article);
  });
}

function renderEmptyState(message) {
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");
  const footerEl = document.getElementById("footer");
  countEl.textContent = "0 entries";
  footerEl.textContent = "";
  listEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  listEl.appendChild(empty);
}
