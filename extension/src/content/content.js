(() => {
  if (window.__myzAnnotatorInitialized) {
    return;
  }

  function selectColor(index) {
    const colors = state.settings.colorPalette || [];
    const color = colors[index] || DEFAULT_COLORS[index] || DEFAULT_COLORS[0];
    state.selectedColor = color;
    state.settings.lastUsedColor = color;
    renderColorPalette();
    persistColorSettings({ lastUsedColor: color });
  }

  function updatePaletteColor(index, value) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      return;
    }
    const palette = [...(state.settings.colorPalette || [])];
    while (palette.length < 5) {
      palette.push(DEFAULT_COLORS[palette.length] || DEFAULT_COLORS[0]);
    }
    const previous = palette[index];
    palette[index] = value;
    state.settings.colorPalette = palette;
    if (state.selectedColor === previous) {
      state.selectedColor = value;
    }
    renderColorPalette();
    persistColorSettings({ colorPalette: palette, lastUsedColor: state.selectedColor });
  }

  function persistColorSettings(patch) {
    sendMessage("myz:updateSettings", patch).catch((error) => {
      console.warn("Failed to persist color settings", error);
    });
  }
  window.__myzAnnotatorInitialized = true;

  const CANONICAL_URL = canonicalUrl(window.location.href);
  const DEFAULT_COLORS = ["#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#a7f3d0"];
  const ALLOWED_HTML_TAGS = new Set([
    "a",
    "b",
    "strong",
    "em",
    "i",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "mark",
    "span",
    "sup",
    "sub",
    "p",
    "div",
    "ul",
    "ol",
    "li",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th"
  ]);
  const ALLOWED_HTML_ATTRS = {
    a: new Set(["href", "title"]),
    td: new Set(["colspan", "rowspan"]),
    th: new Set(["colspan", "rowspan"])
  };
  const highlightCache = new Map();
  const knownTags = new Set();

  const toolbar = createToolbar();
  const modal = createModal();
  const inspector = createInspector();

  const state = {
    currentRange: null,
    currentText: "",
    currentHtml: "",
    editingId: null,
    toolbarShownAt: 0,
    settings: {
      colorPalette: [...DEFAULT_COLORS],
      lastUsedColor: DEFAULT_COLORS[0]
    },
    selectedColor: DEFAULT_COLORS[0]
  };

  init().catch((error) => console.error("MyZ Annotator init failed", error));

  async function init() {
    await loadSettings();

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

  async function loadSettings() {
    try {
      const settings = await sendMessage("myz:getSettings");
      if (!settings) {
        renderColorPalette();
        return;
      }
      const palette = Array.isArray(settings.colorPalette) && settings.colorPalette.length
        ? settings.colorPalette.slice(0, 5)
        : [...DEFAULT_COLORS];
      while (palette.length < 5) {
        palette.push(DEFAULT_COLORS[palette.length] || DEFAULT_COLORS[0]);
      }
      state.settings = {
        ...state.settings,
        ...settings,
        colorPalette: palette
      };
      state.selectedColor = settings.lastUsedColor || palette[0] || DEFAULT_COLORS[0];
    } catch (error) {
      console.warn("Failed to load settings", error);
      state.selectedColor = DEFAULT_COLORS[0];
    }
    renderColorPalette();
  }

  async function restoreHighlights() {
    try {
      const [highlights, tagList] = await Promise.all([
        sendMessage("myz:getHighlightsForUrl", { url: CANONICAL_URL }),
        sendMessage("myz:getAllTags").catch((error) => {
          console.warn("Failed to load known tags", error);
          return null;
        })
      ]);

      if (Array.isArray(tagList)) {
        knownTags.clear();
        addKnownTags(tagList);
      }

      hideInspector();
      Array.from(document.querySelectorAll(".myz-highlight")).forEach((node) => unwrapNode(node));
      highlightCache.clear();

      const records = Array.isArray(highlights) ? highlights : [];
      records.forEach((record) => {
        highlightCache.set(record.id, record);
        addKnownTags(record.tags || []);
        applyHighlight(record);
      });
      updateTagSuggestions();
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
    state.toolbarShownAt = Date.now();
  }

  function hideToolbar() {
    toolbar.classList.add("myz-hidden");
    state.toolbarShownAt = 0;
  }

  function handleDocumentClick(event) {
    const highlightEl = event.target.closest(".myz-highlight");
    if (highlightEl) {
      event.stopPropagation();
      const highlightId = highlightEl.dataset.highlightId;
      const record = highlightCache.get(highlightId);
      if (record) {
        showInspector(record);
        focusHighlight(highlightId);
      }
      return;
    }

    if (inspector.container && inspector.container.contains(event.target)) {
      return;
    }

    if (toolbar.contains(event.target)) {
      return;
    }

    if (modal.container && modal.container.contains(event.target)) {
      return;
    }

    if (state.toolbarShownAt && Date.now() - state.toolbarShownAt < 250) {
      return;
    }

    hideToolbar();
  }

  function createToolbar() {
    const node = document.createElement("div");
    node.className = "myz-annotator-toolbar myz-hidden";
    const annotateButton = document.createElement("button");
    annotateButton.type = "button";
    annotateButton.textContent = "✍️";
    annotateButton.setAttribute("aria-label", "添加标注");
    annotateButton.addEventListener("click", handleAnnotateClick);

    const captureButton = document.createElement("button");
    captureButton.type = "button";
    captureButton.textContent = "📸";
    captureButton.setAttribute("aria-label", "截取选区截图");
    captureButton.addEventListener("click", handleScreenshotClick);

    node.append(annotateButton, captureButton);
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
    state.currentHtml = serializeRangeToHtml(state.currentRange);
    state.editingId = null;
    state.selectedColor = state.settings.lastUsedColor || state.selectedColor || DEFAULT_COLORS[0];
    openModal({
      mode: "create",
      preview: state.currentText,
      note: "",
      tags: [],
      color: state.selectedColor
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

  const tagsField = createTagSelectorField();

  const colorField = createColorPaletteField();

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
      tagsComponent: tagsField.component,
      colorPalette: colorField,
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

  function createTagSelectorField() {
    const wrapper = document.createElement("div");
    wrapper.className = "myz-annotator-field";

    const labelRow = document.createElement("div");
    labelRow.className = "myz-annotator-field__label-row";

    const label = document.createElement("label");
    label.textContent = "标签";

    const hint = document.createElement("span");
    hint.className = "myz-annotator-field__hint";
    hint.textContent = "输入后按回车或逗号确认 · Backspace 回删";

    labelRow.append(label, hint);

    const container = document.createElement("div");
    container.className = "myz-tag-input";

    wrapper.append(labelRow, container);

    const component = createTagInputWidget(container, {
      allowNew: true,
      placeholder: "添加标签"
    });
    component.setOptions(getKnownTagsList());

    return { wrapper, container, component };
  }

  // Lightweight multiselect with chip UI and suggestion dropdown for tag editing.
  function createTagInputWidget(container, config = {}) {
    if (!container) {
      return null;
    }
    const settings = {
      placeholder: "",
      allowNew: false,
      onChange: null,
      ...config
    };
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className = "myz-tag-input__input";
    input.placeholder = settings.placeholder || "";

    const list = document.createElement("div");
    list.className = "myz-tag-input__list myz-hidden";
    list.setAttribute("role", "listbox");
    const listId = `${container.id || "myz-tag"}-options-${Math.random().toString(36).slice(2, 8)}`;
    list.id = listId;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);

    container.textContent = "";
    container.appendChild(input);
    container.appendChild(list);

    const state = {
      tags: [],
      options: [],
      filtered: [],
      activeIndex: -1,
      dropdownOpen: false
    };

    function normalize(tag) {
      return typeof tag === "string" ? tag.trim() : "";
    }

    function uniqueList(values) {
      const seen = new Set();
      const result = [];
      values.forEach((value) => {
        const normalized = normalize(value);
        if (!normalized) {
          return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        result.push(normalized);
      });
      return result;
    }

    function emitChange() {
      if (typeof settings.onChange === "function") {
        settings.onChange([...state.tags]);
      }
    }

    function closeDropdown() {
      state.dropdownOpen = false;
      state.activeIndex = -1;
      list.classList.add("myz-hidden");
      Array.from(list.children).forEach((child) => child.classList.remove("is-active"));
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function updateActiveOption() {
      let activeId = "";
      Array.from(list.children).forEach((child, index) => {
        const isActive = index === state.activeIndex;
        child.classList.toggle("is-active", isActive);
        child.setAttribute("aria-selected", isActive ? "true" : "false");
        if (isActive) {
          activeId = child.id || "";
        }
      });
      if (activeId) {
        input.setAttribute("aria-activedescendant", activeId);
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function renderChips() {
      container.querySelectorAll(".myz-tag-input__chip").forEach((chip) => chip.remove());
      state.tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "myz-tag-input__chip";
        const label = document.createElement("span");
        label.textContent = tag;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "myz-tag-input__remove";
        removeBtn.textContent = "x";
        removeBtn.dataset.tag = tag;
        removeBtn.setAttribute("aria-label", `移除标签 ${tag}`);
        removeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          removeTag(tag);
        });
        chip.append(label, removeBtn);
        container.insertBefore(chip, input);
      });
    }

    function addTag(raw, { silent = false } = {}) {
      const tag = normalize(raw);
      if (!tag) {
        return false;
      }
      if (!settings.allowNew && !state.options.some((option) => option.toLowerCase() === tag.toLowerCase())) {
        return false;
      }
      if (state.tags.some((current) => current.toLowerCase() === tag.toLowerCase())) {
        return false;
      }
      state.tags.push(tag);
      if (settings.allowNew && !state.options.some((option) => option.toLowerCase() === tag.toLowerCase())) {
        state.options.push(tag);
        state.options.sort((a, b) => a.localeCompare(b));
      }
      renderChips();
      if (!silent) {
        emitChange();
      }
      return true;
    }

    function removeTag(tag, { silent = false } = {}) {
      const lower = tag.toLowerCase();
      const next = state.tags.filter((item) => item.toLowerCase() !== lower);
      if (next.length === state.tags.length) {
        return false;
      }
      state.tags = next;
      renderChips();
      if (!silent) {
        emitChange();
      }
      return true;
    }

    function renderOptions() {
      list.innerHTML = "";
      state.filtered.forEach((option, index) => {
        const optionEl = document.createElement("div");
        optionEl.className = "myz-tag-input__option";
        optionEl.setAttribute("role", "option");
        const optionId = `${listId}-option-${index}`;
        optionEl.id = optionId;
        if (index === state.activeIndex) {
          optionEl.classList.add("is-active");
          optionEl.setAttribute("aria-selected", "true");
          input.setAttribute("aria-activedescendant", optionId);
        } else {
          optionEl.setAttribute("aria-selected", "false");
        }
        optionEl.textContent = option;
        optionEl.dataset.value = option;
        optionEl.addEventListener("mousedown", (event) => {
          event.preventDefault();
          if (addTag(option)) {
            input.value = "";
          }
          closeDropdown();
          input.focus();
        });
        list.appendChild(optionEl);
      });
    }

    function filterOptions(query) {
      const term = query.trim().toLowerCase();
      const available = state.options.filter((option) => {
        if (state.tags.some((tag) => tag.toLowerCase() === option.toLowerCase())) {
          return false;
        }
        return term ? option.toLowerCase().includes(term) : true;
      });
      state.filtered = available.slice(0, 50);
      if (!state.filtered.length) {
        closeDropdown();
        return;
      }
      if (!state.dropdownOpen) {
        state.dropdownOpen = true;
        list.classList.remove("myz-hidden");
        input.setAttribute("aria-expanded", "true");
      }
      if (state.activeIndex >= state.filtered.length) {
        state.activeIndex = 0;
      }
      if (state.activeIndex === -1) {
        state.activeIndex = 0;
      }
      renderOptions();
    }

    function commitInput() {
      const hasOptions = state.dropdownOpen && state.filtered[state.activeIndex];
      if (hasOptions) {
        if (addTag(state.filtered[state.activeIndex])) {
          input.value = "";
        }
        closeDropdown();
        return;
      }
      const value = input.value;
      if (!value.trim()) {
        return;
      }
      if (addTag(value)) {
        input.value = "";
      }
      closeDropdown();
    }

    function handleInput(event) {
      const value = event.target.value;
      if (!value.trim()) {
        filterOptions("");
      } else {
        filterOptions(value);
      }
    }

    function handleKeydown(event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitInput();
        return;
      }
      if (event.key === "Backspace" && !input.value && state.tags.length) {
        event.preventDefault();
        removeTag(state.tags[state.tags.length - 1]);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!state.dropdownOpen) {
          filterOptions(input.value);
          return;
        }
        state.activeIndex = state.activeIndex + 1 >= state.filtered.length ? 0 : state.activeIndex + 1;
        updateActiveOption();
        return;
      }
      if (event.key === "ArrowUp" && state.dropdownOpen) {
        event.preventDefault();
        state.activeIndex = state.activeIndex - 1 < 0 ? state.filtered.length - 1 : state.activeIndex - 1;
        updateActiveOption();
        return;
      }
      if (event.key === "Escape") {
        closeDropdown();
      }
    }

    function setOptions(options = []) {
      state.options = uniqueList(options);
      if (state.dropdownOpen) {
        filterOptions(input.value);
      }
    }

    function setValue(values = [], { silent = false } = {}) {
      const next = uniqueList(values);
      const hasChanged = next.length !== state.tags.length || next.some((tag, index) => state.tags[index]?.toLowerCase() !== tag.toLowerCase());
      state.tags = next;
      renderChips();
      if (hasChanged && !silent) {
        emitChange();
      }
    }

    function getValue() {
      return [...state.tags];
    }

    function focus() {
      input.focus();
    }

    function destroy() {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleKeydown);
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("blur", handleBlur);
      container.removeEventListener("click", handleContainerClick);
      closeDropdown();
      container.textContent = "";
    }

    function handleContainerClick(event) {
      if (event.target === container || event.target.closest?.(".myz-tag-input__chip")) {
        input.focus();
      }
    }

    function handleFocus() {
      container.classList.add("is-focused");
      filterOptions(input.value);
    }

    function handleBlur() {
      container.classList.remove("is-focused");
      setTimeout(() => {
        if (!container.contains(document.activeElement)) {
          closeDropdown();
        }
      }, 120);
    }

    input.addEventListener("input", handleInput);
    input.addEventListener("keydown", handleKeydown);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("blur", handleBlur);
    container.addEventListener("click", handleContainerClick);

    return {
      getValue,
      setValue,
      setOptions,
      focus,
      destroy
    };
  }

  function normalizeTagValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function addKnownTags(tags) {
    if (!Array.isArray(tags)) {
      return false;
    }
    let changed = false;
    tags.forEach((tag) => {
      const normalized = normalizeTagValue(tag);
      if (!normalized) {
        return;
      }
      if (!knownTags.has(normalized)) {
        knownTags.add(normalized);
        changed = true;
      }
    });
    return changed;
  }

  function getKnownTagsList() {
    return Array.from(knownTags).sort((a, b) => a.localeCompare(b));
  }

  function updateTagSuggestions() {
    if (modal.tagsComponent) {
      modal.tagsComponent.setOptions(getKnownTagsList());
    }
  }

  function createColorPaletteField() {
    const wrapper = document.createElement("div");
    wrapper.className = "myz-annotator-field";

    const labelRow = document.createElement("div");
    labelRow.className = "myz-annotator-field__label-row";
    const label = document.createElement("label");
    label.textContent = "高亮颜色";
    const hint = document.createElement("span");
    hint.className = "myz-annotator-field__hint";
    hint.textContent = "点击选择 · 调整色块可自定义";
    labelRow.append(label, hint);

    const paletteContainer = document.createElement("div");
    paletteContainer.className = "myz-color-palette";

    wrapper.append(labelRow, paletteContainer);

    return {
      wrapper,
      container: paletteContainer,
      swatches: []
    };
  }

  function renderColorPalette() {
    if (!modal.colorPalette?.container) {
      return;
    }
    const container = modal.colorPalette.container;
    container.innerHTML = "";
    const colors = (state.settings.colorPalette || []).slice(0, 5);
    while (colors.length < 5) {
      colors.push(DEFAULT_COLORS[colors.length] || DEFAULT_COLORS[0]);
    }

    colors.forEach((color, index) => {
      const swatchWrapper = document.createElement("div");
      swatchWrapper.className = "myz-color-swatch-wrapper";

      const swatchButton = document.createElement("button");
      swatchButton.type = "button";
      swatchButton.className = "myz-color-swatch";
      swatchButton.style.setProperty("--myz-swatch-color", color);
      swatchButton.dataset.index = String(index);
      swatchButton.setAttribute("aria-label", `选择颜色 ${color}`);
      if (color === state.selectedColor) {
        swatchButton.classList.add("is-active");
      }
      swatchButton.addEventListener("click", () => selectColor(index));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "myz-color-edit";
      editButton.dataset.index = String(index);
      editButton.textContent = "✎";
      editButton.setAttribute("aria-label", `编辑颜色 ${color}`);

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = color;
      colorInput.className = "myz-color-editor";
      colorInput.addEventListener("input", (event) => {
        const value = event.target.value;
        updatePaletteColor(index, value);
      });

      editButton.addEventListener("click", () => {
        if (typeof colorInput.showPicker === "function") {
          colorInput.showPicker();
        } else {
          colorInput.click();
        }
      });

      swatchWrapper.append(swatchButton, editButton, colorInput);
      container.appendChild(swatchWrapper);
    });
  }

  function openModal(options) {
    modal.title.textContent = options.mode === "edit" ? "编辑批注" : "添加批注";
    modal.preview.textContent = options.preview || "";
    modal.noteInput.value = options.note || "";
    if (modal.tagsComponent) {
      const initialTags = Array.isArray(options.tags)
        ? options.tags.filter(Boolean)
        : options.tags
        ? [options.tags]
        : [];
      const optionsSet = new Set([...getKnownTagsList(), ...initialTags]);
      modal.tagsComponent.setOptions(Array.from(optionsSet).sort((a, b) => a.localeCompare(b)));
      modal.tagsComponent.setValue(initialTags, { silent: true });
    }
    state.selectedColor = options.color || state.settings.lastUsedColor || state.selectedColor || DEFAULT_COLORS[0];
    renderColorPalette();
    modal.deleteButton.classList.toggle("myz-hidden", options.mode !== "edit");
    modal.container.classList.remove("myz-hidden");
  }

  function closeModal() {
    modal.container.classList.add("myz-hidden");
    state.currentRange = null;
    state.currentText = "";
    state.currentHtml = "";
    state.editingId = null;
    if (modal.tagsComponent) {
      modal.tagsComponent.setValue([], { silent: true });
    }
  }

  async function handleSubmit() {
    const note = modal.noteInput.value.trim();
    const tags = modal.tagsComponent ? modal.tagsComponent.getValue() : [];
    const color = state.selectedColor || state.settings.lastUsedColor || DEFAULT_COLORS[0];

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
        html: state.currentHtml || "",
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
        if (addKnownTags(record.tags || tags)) {
          updateTagSuggestions();
        }
      }
      persistColorSettings({ lastUsedColor: color });
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
      if (addKnownTags(record.tags || [])) {
        updateTagSuggestions();
      }
      const nodes = document.querySelectorAll(`[data-highlight-id="${record.id}"]`);
      nodes.forEach((node) => {
        node.style.backgroundColor = record.color || "#ffe58f";
      });
      if (inspector.currentId === record.id) {
        showInspector(record);
      }
      state.settings.lastUsedColor = record.color || state.settings.lastUsedColor;
      state.selectedColor = record.color || state.selectedColor;
      renderColorPalette();
      persistColorSettings({ lastUsedColor: record.color });
    } catch (error) {
      console.error("Failed to update highlight", error);
    }
  }

  async function deleteHighlight(id) {
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlightCache.delete(id);
      removeHighlightFromDom(id);
      if (inspector.currentId === id) {
        hideInspector();
      }
    } catch (error) {
      console.error("Failed to delete highlight", error);
    }
  }
  function createInspector() {
    const aside = document.createElement("aside");
    aside.className = "myz-inspector myz-hidden";

    const header = document.createElement("div");
    header.className = "myz-inspector__header";
    const title = document.createElement("div");
    title.className = "myz-inspector__title";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "myz-inspector__close";
    closeButton.textContent = "×";
    header.append(title, closeButton);

  const infoRow = document.createElement("div");
  infoRow.className = "myz-inspector__info";

  const colorBadge = document.createElement("span");
  colorBadge.className = "myz-inspector__color";

  const meta = document.createElement("div");
  meta.className = "myz-inspector__meta";
  infoRow.append(colorBadge, meta);

    const tags = document.createElement("div");
    tags.className = "myz-inspector__tags";

    const body = document.createElement("div");
    body.className = "myz-inspector__body";

    const quote = document.createElement("blockquote");
    quote.className = "myz-inspector__quote";

    const note = document.createElement("div");
    note.className = "myz-inspector__note";

    const footer = document.createElement("div");
    footer.className = "myz-inspector__actions";

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

  footer.append(copyButton, editButton, deleteButton);
  body.append(infoRow, tags, quote, note);
    aside.append(header, body, footer);
    document.documentElement.appendChild(aside);

    closeButton.addEventListener("click", hideInspector);

    copyButton.addEventListener("click", async () => {
      if (!inspector.currentId) {
        return;
      }
      const record = highlightCache.get(inspector.currentId);
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
      if (!inspector.currentId) {
        return;
      }
      const record = highlightCache.get(inspector.currentId);
      if (!record) {
        return;
      }
      state.editingId = record.id;
      openModal({
        mode: "edit",
        preview: record.text,
        note: record.note || "",
        tags: record.tags || [],
        color: record.color || state.selectedColor
      });
    });

    deleteButton.addEventListener("click", () => {
      if (!inspector.currentId) {
        return;
      }
      deleteHighlight(inspector.currentId);
    });

    return {
      container: aside,
      header,
      title,
      color: colorBadge,
  info: infoRow,
  meta,
      tags,
      quote,
      note,
      currentId: null
    };
  }

  function showInspector(record) {
    if (!record) {
      return;
    }
    inspector.currentId = record.id;
    inspector.title.textContent = record.title || record.hostname || "标注详情";
  inspector.color.style.background = record.color || "#ffe58f";
  inspector.color.title = `高亮颜色：${record.color || "#ffe58f"}`;

    const createdAt = record.createdAt ? new Date(record.createdAt) : null;
    const metaParts = [];
    if (createdAt) {
      metaParts.push(createdAt.toLocaleString());
    }
    if (record.hostname) {
      metaParts.push(record.hostname);
    }
    inspector.meta.textContent = metaParts.join(" · ") || "";

    inspector.tags.innerHTML = "";
    if (Array.isArray(record.tags) && record.tags.length) {
      inspector.tags.classList.remove("myz-hidden");
      record.tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "myz-tag";
        span.textContent = tag;
        inspector.tags.appendChild(span);
      });
    } else {
      inspector.tags.classList.add("myz-hidden");
    }

    if (record.html) {
      inspector.quote.innerHTML = record.html;
    } else {
      inspector.quote.textContent = record.text || "";
    }
  inspector.note.textContent = record.note || "无批注";

    inspector.container.classList.remove("myz-hidden");
  }

  function hideInspector() {
    inspector.container.classList.add("myz-hidden");
    inspector.currentId = null;
  }

  function applyHighlight(record) {
    if (!record?.range) {
      return;
    }
    try {
      const range = deserializeRange(record.range);
      if (!range || range.collapsed) {
        return;
      }
      removeHighlightFromDom(record.id);
      if (rangeContainsBlockElements(range)) {
        wrapRangeAcrossNodes(range, record);
      } else {
        wrapSimpleRange(range, record);
      }
    } catch (error) {
      console.warn("Unable to apply highlight", error, record);
    }
  }

  function createHighlightElement(record) {
    const highlight = document.createElement("span");
    highlight.className = "myz-highlight";
    highlight.dataset.highlightId = record.id;
    highlight.style.backgroundColor = record.color || "#ffe58f";
    return highlight;
  }

  function wrapSimpleRange(range, record) {
    const highlight = createHighlightElement(record);
    const fragment = range.cloneContents();
    highlight.appendChild(fragment);
    range.deleteContents();
    range.insertNode(highlight);
  }

  function wrapRangeAcrossNodes(range, record) {
    const textNodes = collectTextNodes(range);
    textNodes.forEach((node) => wrapTextNodeSegment(node, range, record));
  }

  function collectTextNodes(range) {
    const nodes = [];
    const iterator = document.createNodeIterator(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!range.intersectsNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let current;
    while ((current = iterator.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  function wrapTextNodeSegment(node, range, record) {
    const offsets = computeSegmentOffsets(node, range);
    if (!offsets || offsets.end <= offsets.start) {
      return;
    }
    let target = node;
    const length = node.textContent.length;
    if (offsets.end < length) {
      target.splitText(offsets.end);
    }
    if (offsets.start > 0) {
      target = target.splitText(offsets.start);
    }
    if (!target.textContent.trim()) {
      return;
    }
    const highlight = createHighlightElement(record);
    target.parentNode.insertBefore(highlight, target);
    highlight.appendChild(target);
  }

  function computeSegmentOffsets(node, range) {
    const length = node.textContent.length;
    let start = 0;
    let end = length;

    if (node === range.startContainer) {
      start = range.startOffset;
    }
    if (node === range.endContainer) {
      end = range.endOffset;
    }

    const startPosition = range.startContainer.compareDocumentPosition(node);
    if (startPosition & Node.DOCUMENT_POSITION_FOLLOWING) {
      start = 0;
    }
    const endPosition = range.endContainer.compareDocumentPosition(node);
    if (endPosition & Node.DOCUMENT_POSITION_PRECEDING) {
      end = length;
    }

    start = Math.max(0, Math.min(start, length));
    end = Math.max(start, Math.min(end, length));
    return { start, end };
  }

  function rangeContainsBlockElements(range) {
    const fragment = range.cloneContents();
    if (!fragment) {
      return false;
    }
    const blockSelector = "p,div,section,article,header,footer,main,aside,nav,ul,ol,li,table,tbody,tr,td,th,blockquote,pre";
    return fragment.querySelector(blockSelector) !== null;
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

  async function handleScreenshotClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range);
    if (!rect || rect.width < 4 || rect.height < 4) {
      hideToolbar();
      return;
    }
    const restoreSelection = suppressSelectionHighlight();
    try {
      const result = await sendMessage("myz:captureSelection", { format: "png" });
      if (!result || !result.dataUrl) {
        return;
      }
      await cropAndDownloadSelection(result.dataUrl, rect);
    } catch (error) {
      console.error("Selection capture failed", error);
    } finally {
      if (typeof restoreSelection === "function") {
        restoreSelection();
      }
      hideToolbar();
    }
  }

  function getSelectionBoundingRect(range) {
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height);
    if (!rects.length) {
      const fallback = range.getBoundingClientRect();
      if (!fallback || !fallback.width || !fallback.height) {
        return null;
      }
      return {
        top: fallback.top,
        left: fallback.left,
        width: fallback.width,
        height: fallback.height
      };
    }
    const bounds = rects.reduce(
      (acc, rect) => ({
        top: Math.min(acc.top, rect.top),
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom)
      }),
      {
        top: rects[0].top,
        left: rects[0].left,
        right: rects[0].right,
        bottom: rects[0].bottom
      }
    );
    return {
      top: bounds.top,
      left: bounds.left,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top
    };
  }

  async function cropAndDownloadSelection(dataUrl, rect) {
    const image = await loadImage(dataUrl);
    const viewportWidth = window.innerWidth || image.width;
    const viewportHeight = window.innerHeight || image.height;
    const scaleX = image.width / viewportWidth;
    const scaleY = image.height / viewportHeight;
    const sx = Math.max(0, Math.floor(rect.left * scaleX));
    const sy = Math.max(0, Math.floor(rect.top * scaleY));
    const sw = Math.min(image.width - sx, Math.floor(rect.width * scaleX));
    const sh = Math.min(image.height - sy, Math.floor(rect.height * scaleY));
    if (sw <= 0 || sh <= 0) {
      throw new Error("Selection bounds are outside the captured area");
    }
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context is unavailable");
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropped = canvas.toDataURL("image/png");
    downloadImage(cropped, `myz-selection-${Date.now()}.png`);
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load screenshot"));
      image.src = dataUrl;
    });
  }

  function downloadImage(dataUrl, filename) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.click();
  }

  // Temporarily hides the native selection highlight while capturing screenshots.
  function suppressSelectionHighlight() {
    try {
      const style = document.createElement("style");
      style.className = "myz-hide-selection";
      style.textContent = "*::selection { background: transparent !important; color: inherit !important; }\n*::-moz-selection { background: transparent !important; color: inherit !important; }";
      const target = document.head || document.documentElement;
      target.appendChild(style);
      return () => {
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      };
    } catch (error) {
      console.warn("Failed to suppress selection highlight", error);
      return null;
    }
  }

  function serializeRangeToHtml(range) {
    try {
      const fragment = range.cloneContents();
      if (!fragment || !fragment.childNodes.length) {
        return "";
      }
      const container = document.createElement("div");
      container.appendChild(fragment);
      sanitizeNode(container);
      return container.innerHTML.trim();
    } catch (error) {
      console.warn("Failed to serialize selection HTML", error);
      return "";
    }
  }

  function sanitizeNode(root) {
    Array.from(root.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        sanitizeElement(child);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        root.removeChild(child);
      }
    });
  }

  function sanitizeElement(element) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) {
      const parent = element.parentNode;
      if (!parent) {
        return;
      }
      const children = Array.from(element.childNodes);
      children.forEach((child) => parent.insertBefore(child, element));
      parent.removeChild(element);
      children.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          sanitizeElement(child);
        }
      });
      return;
    }

    Array.from(element.attributes).forEach((attr) => {
      if (!isAllowedAttribute(tag, attr.name)) {
        element.removeAttribute(attr.name);
        return;
      }
      if (attr.name === "href") {
        const sanitizedHref = normalizeHref(attr.value);
        if (sanitizedHref) {
          element.setAttribute("href", sanitizedHref);
        } else {
          element.removeAttribute("href");
        }
      }
    });

    if (tag === "a" && element.hasAttribute("href")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }

    sanitizeNode(element);
  }

  function isAllowedAttribute(tag, name) {
    const whitelist = ALLOWED_HTML_ATTRS[tag];
    if (!whitelist) {
      return false;
    }
    return whitelist.has(name);
  }

  function normalizeHref(value) {
    if (!value || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = new URL(trimmed, window.location.href);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
        return parsed.toString();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  function isSafeUrl(url) {
    return Boolean(normalizeHref(url));
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
