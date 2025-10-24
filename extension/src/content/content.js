(() => {
  if (window.__myzAnnotatorInitialized) {
    return;
  }
  window.__myzAnnotatorInitialized = true;

  const CANONICAL_URL = canonicalUrl(window.location.href);
  const highlightCache = new Map();

  const toolbar = createToolbar();
  const modal = createModal();
  const tooltip = createTooltip();

  const state = {
    currentRange: null,
    currentText: "",
    editingId: null
  };

  init().catch((error) => console.error("MyZ Annotator init failed", error));

  async function init() {
    document.addEventListener("mouseup", handleSelectionTrigger);
    document.addEventListener("keyup", handleSelectionTrigger);
    document.addEventListener("scroll", hideToolbar, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideToolbar();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) {
        return false;
      }
      if (message.type === "myz:scrollToHighlight") {
        const id = message.payload?.id;
        const success = focusHighlight(id);
        sendResponse?.({ ok: success });
        return false;
      }
      if (message.type === "myz:refreshHighlights") {
        restoreHighlights()
          .then(() => sendResponse?.({ ok: true }))
          .catch((error) => {
            console.error("Refresh highlights failed", error);
            sendResponse?.({ ok: false });
          });
        return true;
      }
      return false;
    });

    await restoreHighlights();
  }

  async function restoreHighlights() {
    try {
      const highlights = await sendMessage("myz:getHighlightsForUrl", { url: CANONICAL_URL });
      if (!Array.isArray(highlights)) {
        return;
      }
      Array.from(document.querySelectorAll(".myz-highlight")).forEach((node) => unwrapNode(node));
      highlightCache.clear();
      highlights.forEach((record) => {
        highlightCache.set(record.id, record);
        applyHighlight(record);
      });
    } catch (error) {
      console.error("Failed to restore highlights", error);
    }
  }

  function handleSelectionTrigger(event) {
    if (modal.container && !modal.container.classList.contains("myz-hidden")) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 && rect.height === 0) {
      hideToolbar();
      return;
    }
    showToolbar(rect);
  }

  function showToolbar(rect) {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    toolbar.style.top = `${rect.top + scrollY}px`;
    toolbar.style.left = `${rect.left + scrollX + rect.width / 2}px`;
    toolbar.classList.remove("myz-hidden");
  }

  function hideToolbar() {
    toolbar.classList.add("myz-hidden");
  }

  function handleDocumentClick(event) {
    const highlightEl = event.target.closest(".myz-highlight");
    if (highlightEl) {
      event.stopPropagation();
      const highlightId = highlightEl.dataset.highlightId;
      const record = highlightCache.get(highlightId);
      if (record) {
        showTooltip(highlightEl, record);
      }
      return;
    }

    if (tooltip.container && !tooltip.container.contains(event.target)) {
      hideTooltip();
    }

    if (toolbar.contains(event.target)) {
      return;
    }

    if (modal.container && modal.container.contains(event.target)) {
      return;
    }

    hideToolbar();
  }

  function createToolbar() {
    const node = document.createElement("div");
    node.className = "myz-annotator-toolbar myz-hidden";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "标注";
    button.addEventListener("click", handleAnnotateClick);
    node.appendChild(button);
    document.documentElement.appendChild(node);
    return node;
  }

  function handleAnnotateClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }
    state.currentRange = selection.getRangeAt(0).cloneRange();
    state.currentText = selection.toString().trim();
    state.editingId = null;
    openModal({
      mode: "create",
      preview: state.currentText,
      note: "",
      tags: [],
      color: "#ffe58f"
    });
  }

  function createModal() {
    const container = document.createElement("div");
    container.className = "myz-annotator-modal myz-hidden";

    const body = document.createElement("div");
    body.className = "myz-annotator-modal__body";

    const header = document.createElement("div");
    header.className = "myz-annotator-modal__header";
    const title = document.createElement("h3");
    title.textContent = "添加批注";
    const closeButton = document.createElement("button");
    closeButton.className = "myz-annotator-modal__close";
    closeButton.type = "button";
    closeButton.innerHTML = "&times;";
    closeButton.addEventListener("click", closeModal);
    header.append(title, closeButton);

    const preview = document.createElement("div");
    preview.className = "myz-annotator-preview";

    const noteField = createField("批注", "textarea");
    noteField.input.rows = 4;

    const tagsField = createField("标签（逗号分隔）", "input");
    tagsField.input.placeholder = "如：研究, #logseq";

    const colorField = createField("高亮颜色", "input");
    colorField.input.type = "color";
    colorField.input.value = "#ffe58f";

    const actions = document.createElement("div");
    actions.className = "myz-annotator-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "myz-btn-secondary";
    cancelButton.textContent = "取消";
    cancelButton.addEventListener("click", closeModal);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "myz-btn-danger myz-hidden";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => {
      if (!state.editingId) {
        return;
      }
      deleteHighlight(state.editingId);
      closeModal();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "myz-btn-primary";
    saveButton.textContent = "保存";
    saveButton.addEventListener("click", handleSubmit);

    actions.append(cancelButton, deleteButton, saveButton);

    body.append(header, preview, noteField.wrapper, tagsField.wrapper, colorField.wrapper, actions);
    container.appendChild(body);
    document.documentElement.appendChild(container);

    return {
      container,
      body,
      title,
      preview,
      noteInput: noteField.input,
      tagsInput: tagsField.input,
      colorInput: colorField.input,
      saveButton,
      deleteButton
    };
  }

  function createField(labelText, type) {
    const wrapper = document.createElement("div");
    wrapper.className = "myz-annotator-field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function openModal(options) {
    modal.title.textContent = options.mode === "edit" ? "编辑批注" : "添加批注";
    modal.preview.textContent = options.preview || "";
    modal.noteInput.value = options.note || "";
    modal.tagsInput.value = Array.isArray(options.tags) ? options.tags.join(", ") : options.tags || "";
    modal.colorInput.value = options.color || "#ffe58f";
    modal.deleteButton.classList.toggle("myz-hidden", options.mode !== "edit");
    modal.container.classList.remove("myz-hidden");
  }

  function closeModal() {
    modal.container.classList.add("myz-hidden");
    state.currentRange = null;
    state.currentText = "";
    state.editingId = null;
  }

  async function handleSubmit() {
    const note = modal.noteInput.value.trim();
    const tags = parseTags(modal.tagsInput.value);
    const color = modal.colorInput.value || "#ffe58f";

    if (state.editingId) {
      await updateExistingHighlight({ id: state.editingId, note, tags, color });
      closeModal();
      return;
    }

    if (!state.currentRange || !state.currentText) {
      closeModal();
      return;
    }

    const serializedRange = serializeRange(state.currentRange);
    if (!serializedRange) {
      closeModal();
      return;
    }

    try {
      const payload = {
        url: CANONICAL_URL,
        sourceUrl: window.location.href,
        title: document.title,
        text: state.currentText,
        note,
        tags,
        color,
        range: serializedRange,
        hostname: window.location.hostname
      };
      const record = await sendMessage("myz:saveHighlight", payload);
      if (record) {
        highlightCache.set(record.id, record);
        applyHighlight(record);
      }
    } catch (error) {
      console.error("Failed to save highlight", error);
    } finally {
      closeModal();
      window.getSelection()?.removeAllRanges();
      hideToolbar();
    }
  }

  async function updateExistingHighlight(update) {
    try {
      const record = await sendMessage("myz:updateHighlight", update);
      if (!record) {
        return;
      }
      highlightCache.set(record.id, record);
      const nodes = document.querySelectorAll(`[data-highlight-id="${record.id}"]`);
      nodes.forEach((node) => {
        node.style.backgroundColor = record.color || "#ffe58f";
      });
      if (tooltip.currentId === record.id) {
        showTooltip(tooltip.anchor, record);
      }
    } catch (error) {
      console.error("Failed to update highlight", error);
    }
  }

  async function deleteHighlight(id) {
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlightCache.delete(id);
      removeHighlightFromDom(id);
      hideTooltip();
    } catch (error) {
      console.error("Failed to delete highlight", error);
    }
  }

  function createTooltip() {
    const node = document.createElement("div");
    node.className = "myz-annotator-tooltip myz-hidden";

    const meta = document.createElement("div");
    meta.className = "myz-annotator-tooltip__meta";
    const tags = document.createElement("div");
    tags.className = "myz-annotator-tooltip__tags";
    const quote = document.createElement("div");
    quote.className = "myz-annotator-tooltip__quote";
    const note = document.createElement("div");
    note.className = "myz-annotator-tooltip__note";

    const actions = document.createElement("div");
    actions.className = "myz-annotator-tooltip__actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.className = "myz-btn-secondary";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "编辑";
    editButton.className = "myz-btn-primary";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.className = "myz-btn-danger";

    actions.append(copyButton, editButton, deleteButton);
  node.append(meta, tags, quote, note, actions);

    copyButton.addEventListener("click", async () => {
      if (!tooltip.currentId) {
        return;
      }
      const record = highlightCache.get(tooltip.currentId);
      if (!record) {
        return;
      }
      const markdown = recordToMarkdown(record);
      try {
        await navigator.clipboard.writeText(markdown);
      } catch (error) {
        console.error("Clipboard copy failed", error);
      }
    });

    editButton.addEventListener("click", () => {
      if (!tooltip.currentId) {
        return;
      }
      const record = highlightCache.get(tooltip.currentId);
      if (!record) {
        return;
      }
      state.editingId = record.id;
      openModal({
        mode: "edit",
        preview: record.text,
        note: record.note || "",
        tags: record.tags || [],
        color: record.color || "#ffe58f"
      });
      hideTooltip();
    });

    deleteButton.addEventListener("click", () => {
      if (!tooltip.currentId) {
        return;
      }
      deleteHighlight(tooltip.currentId);
    });

    document.documentElement.appendChild(node);
    return { container: node, meta, tags, quote, note, currentId: null, anchor: null };
  }

  function showTooltip(anchorEl, record) {
    tooltip.anchor = anchorEl;
    tooltip.currentId = record.id;

    const createdAt = record.createdAt ? new Date(record.createdAt) : null;
    const metaParts = [];
    if (createdAt) {
      metaParts.push(createdAt.toLocaleString());
    }
    if (record.hostname) {
      metaParts.push(record.hostname);
    }
    tooltip.meta.textContent = metaParts.join(" · ") || "";

    tooltip.tags.innerHTML = "";
    if (Array.isArray(record.tags)) {
      record.tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "myz-tag";
        span.textContent = tag;
        tooltip.tags.appendChild(span);
      });
    }

    tooltip.quote.textContent = record.text || "";
    tooltip.note.textContent = record.note || "无批注";

    tooltip.container.style.visibility = "hidden";
    tooltip.container.classList.remove("myz-hidden");

    const rect = anchorEl.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const top = rect.bottom + scrollY + 10;
    const width = tooltip.container.offsetWidth || 260;
    let left = rect.left + scrollX + rect.width / 2 - width / 2;
    left = Math.max(scrollX + 12, Math.min(left, scrollX + window.innerWidth - width - 12));

    tooltip.container.style.top = `${top}px`;
    tooltip.container.style.left = `${left}px`;
    tooltip.container.style.visibility = "visible";
  }

  function hideTooltip() {
    tooltip.container.classList.add("myz-hidden");
    tooltip.currentId = null;
    tooltip.anchor = null;
  }

  function applyHighlight(record) {
    if (!record?.range) {
      return;
    }
    try {
      const range = deserializeRange(record.range);
      if (!range) {
        return;
      }
      removeHighlightFromDom(record.id);
      const highlight = document.createElement("span");
      highlight.className = "myz-highlight";
      highlight.dataset.highlightId = record.id;
      highlight.style.backgroundColor = record.color || "#ffe58f";
      const fragment = range.cloneContents();
      highlight.appendChild(fragment);
      range.deleteContents();
      range.insertNode(highlight);
    } catch (error) {
      console.warn("Unable to apply highlight", error, record);
    }
  }

  function focusHighlight(id) {
    if (!id) {
      return false;
    }
    const node = document.querySelector(`[data-highlight-id="${id}"]`);
    if (!node) {
      return false;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("myz-highlight--flash");
    setTimeout(() => node.classList.remove("myz-highlight--flash"), 1400);
    return true;
  }

  function removeHighlightFromDom(id) {
    const nodes = document.querySelectorAll(`[data-highlight-id="${id}"]`);
    nodes.forEach((node) => unwrapNode(node));
  }

  function unwrapNode(node) {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
    parent.normalize();
  }

  function serializeRange(range) {
    try {
      return {
        start: {
          path: buildPath(range.startContainer),
          offset: range.startOffset
        },
        end: {
          path: buildPath(range.endContainer),
          offset: range.endOffset
        }
      };
    } catch (error) {
      console.error("Failed to serialize range", error);
      return null;
    }
  }

  function deserializeRange(serialized) {
    if (!serialized?.start || !serialized?.end) {
      return null;
    }
    const range = document.createRange();
    const startNode = resolvePath(serialized.start.path);
    const endNode = resolvePath(serialized.end.path);
    if (!startNode || !endNode) {
      return null;
    }
    const startOffset = clampOffset(startNode, serialized.start.offset);
    const endOffset = clampOffset(endNode, serialized.end.offset);
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
    } catch (error) {
      console.error("Failed to reconstruct range", error);
      return null;
    }
    return range;
  }

  function buildPath(node) {
    const path = [];
    let current = node;
    while (current && current !== document) {
      const parent = current.parentNode;
      if (!parent) {
        break;
      }
      const siblings = Array.from(parent.childNodes).filter((child) => sameNodeType(child, current));
      const index = siblings.indexOf(current);
      path.unshift({
        name: nodeName(current),
        index
      });
      current = parent;
    }
    return path;
  }

  function resolvePath(path) {
    let current = document;
    for (const segment of path) {
      const candidates = Array.from(current.childNodes).filter((child) => {
        if (segment.name === "#text") {
          return child.nodeType === Node.TEXT_NODE;
        }
        return child.nodeType === Node.ELEMENT_NODE && child.nodeName.toLowerCase() === segment.name;
      });
      current = candidates[segment.index] || null;
      if (!current) {
        return null;
      }
    }
    return current;
  }

  function nodeName(node) {
    return node.nodeType === Node.TEXT_NODE ? "#text" : node.nodeName.toLowerCase();
  }

  function sameNodeType(a, b) {
    if (a.nodeType !== b.nodeType) {
      return false;
    }
    if (a.nodeType === Node.TEXT_NODE) {
      return true;
    }
    return a.nodeName === b.nodeName;
  }

  function clampOffset(node, requested) {
    if (node.nodeType === Node.TEXT_NODE) {
      return Math.min(requested, node.textContent.length);
    }
    return Math.min(requested, node.childNodes.length);
  }

  function canonicalUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      u.hash = "";
      return u.toString();
    } catch (error) {
      return url;
    }
  }

  function parseTags(value) {
    if (!value) {
      return [];
    }
    return value
      .split(/[,#]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag));
  }

  function recordToMarkdown(record) {
    const tags = Array.isArray(record.tags) && record.tags.length ? ` #${record.tags.join(" #")}` : "";
    const quote = (record.text || "")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const note = record.note ? `\n\n${record.note}` : "";
    return `- **${record.title || record.hostname || "页面"}**${tags} ([链接](${record.sourceUrl || record.url}))\n${quote}${note}`;
  }

  function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("空响应"));
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
})();
