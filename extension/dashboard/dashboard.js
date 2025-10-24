const groupsEl = document.getElementById("highlight-groups");
const groupTemplate = document.getElementById("group-template");
const cardTemplate = document.getElementById("card-template");
const listRowTemplate = document.getElementById("list-row-template");

const highlightsView = document.getElementById("highlights-view");
const settingsView = document.getElementById("settings-view");

const searchInput = document.getElementById("filter-search");
const siteSelect = document.getElementById("filter-site");
const filterTagsContainer = document.getElementById("filter-tags");
const fromInput = document.getElementById("filter-from");
const toInput = document.getElementById("filter-to");
const resetFiltersBtn = document.getElementById("reset-filters");
const summaryEl = document.getElementById("summary");
const exportMarkdownBtn = document.getElementById("export-markdown");
const exportJsonBtn = document.getElementById("export-json");
const syncLogseqBtn = document.getElementById("sync-logseq");
const logseqStatusEl = document.getElementById("logseq-status");

const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const saveSettingsBtn = document.getElementById("save-settings");
const logseqSettingsFields = document.getElementById("logseq-settings-fields");
const logseqSyncToggle = document.getElementById("logseq-sync-enabled");
const logseqEndpointInput = document.getElementById("logseq-endpoint");
const logseqTokenInput = document.getElementById("logseq-token");
const logseqGraphInput = document.getElementById("logseq-graph");
const settingsStatusEl = document.getElementById("settings-status");

const viewCardsBtn = document.getElementById("view-cards");
const viewListBtn = document.getElementById("view-list");
const pickerButtons = document.querySelectorAll("[data-picker-for]");

const modal = {
	container: document.getElementById("record-modal"),
	title: document.getElementById("modal-title"),
	quote: document.getElementById("modal-quote"),
	noteDisplay: document.getElementById("modal-note-display"),
	noteInput: document.getElementById("modal-note-input"),
	tagsDisplay: document.getElementById("modal-tags-display"),
	tagsInput: document.getElementById("modal-tags-input"),
	tagsComponent: null,
	colorSwatch: document.getElementById("modal-color-swatch"),
	colorPicker: document.getElementById("modal-color-picker"),
	colorWrapper: document.getElementById("modal-color-picker")?.parentElement || null,
	saveButton: document.getElementById("modal-save"),
	cancelButton: document.getElementById("modal-cancel"),
	closeButton: document.getElementById("modal-close"),
	status: document.getElementById("modal-status")
};

const scrollSentinel = document.createElement("div");
scrollSentinel.className = "scroll-sentinel";

const DEFAULT_COLOR = "#fde68a";
const PAGINATION_BATCH = 24;

const filterTagInput = filterTagsContainer
	? createTagInputWidget(filterTagsContainer, {
		placeholder: "输入后按回车或逗号确认",
		onChange: (tags) => {
			state.filters.tags = tags;
			applyFilters();
		}
	})
	: null;

if (modal.tagsInput) {
	modal.tagsComponent = createTagInputWidget(modal.tagsInput, {
		placeholder: "输入后按回车或逗号确认",
		allowNew: true
	});
}

const tagInputInstances = {
	filter: filterTagInput,
	modal: modal.tagsComponent
};

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
	searchTerms: [],
	view: "cards",
	settings: {
		logseqEndpoint: "",
		logseqAuthToken: "",
		logseqGraph: "",
		logseqSyncEnabled: false,
		dashboardView: "cards"
	},
	pagination: {
		rendered: 0
	},
	availableTags: [],
	panel: "highlights"
};

let modalState = { recordId: null, mode: "view" };
let infiniteObserver = null;

init().catch((error) => {
	console.error("Dashboard init failed", error);
	if (groupsEl) {
		groupsEl.innerHTML = `<p class="empty-state">加载失败：${error.message}</p>`;
	}
});

async function init() {
	if (!groupsEl) {
		return;
	}
	setupInfiniteScroll();
	bindEvents();
	await loadSettings();
	await loadHighlights();
	applyFilters();
	updateViewToggle();
}

function bindEvents() {
	if (searchInput) {
		searchInput.addEventListener("input", () => applyFilters());
	}
	if (siteSelect) {
		siteSelect.addEventListener("change", () => {
			state.filters.site = siteSelect.value;
			applyFilters();
		});
	}
	if (fromInput) {
		fromInput.addEventListener("change", () => {
			state.filters.from = fromInput.value;
			applyFilters();
		});
	}
	if (toInput) {
		toInput.addEventListener("change", () => {
			state.filters.to = toInput.value;
			applyFilters();
		});
	}
	if (resetFiltersBtn) {
		resetFiltersBtn.addEventListener("click", resetFilters);
	}

	if (exportMarkdownBtn) {
		exportMarkdownBtn.addEventListener("click", () => handleExport("markdown"));
	}
	if (exportJsonBtn) {
		exportJsonBtn.addEventListener("click", () => handleExport("json"));
	}
	if (syncLogseqBtn) {
		syncLogseqBtn.addEventListener("click", syncLogseq);
	}

	if (groupsEl) {
		groupsEl.addEventListener("click", handleCardAction);
	}

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

	if (viewCardsBtn) {
		viewCardsBtn.addEventListener("click", () => setView("cards"));
	}
	if (viewListBtn) {
		viewListBtn.addEventListener("click", () => setView("list"));
	}

	if (openSettingsBtn) {
		openSettingsBtn.addEventListener("click", showSettingsView);
	}
	if (closeSettingsBtn) {
		closeSettingsBtn.addEventListener("click", showHighlightsView);
	}

	if (logseqSyncToggle) {
		logseqSyncToggle.addEventListener("change", handleSyncToggle);
	}

	if (saveSettingsBtn) {
		saveSettingsBtn.addEventListener("click", saveSettings);
	}

	if (modal.closeButton) {
		modal.closeButton.addEventListener("click", closeRecordModal);
	}
	if (modal.cancelButton) {
		modal.cancelButton.addEventListener("click", closeRecordModal);
	}
	if (modal.saveButton) {
		modal.saveButton.addEventListener("click", handleModalSave);
	}
	if (modal.container) {
		modal.container.addEventListener("click", (event) => {
			if (event.target === modal.container) {
				closeRecordModal();
			}
		});
	}
	if (modal.colorPicker) {
		modal.colorPicker.addEventListener("input", (event) => {
			const value = event.target.value || DEFAULT_COLOR;
			if (modal.colorSwatch) {
				modal.colorSwatch.style.background = value;
			}
		});
	}

	document.addEventListener("keydown", handleModalKeydown);
}

function setupInfiniteScroll() {
	if (infiniteObserver) {
		return;
	}
	const root = document.querySelector(".main");
	infiniteObserver = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				loadMoreHighlights();
			}
		},
		{
			root: root || null,
			rootMargin: "0px 0px 200px 0px"
		}
	);
}

async function loadHighlights() {
	if (!groupsEl) {
		return;
	}
	groupsEl.innerHTML = `<p class="empty-state">正在加载…</p>`;
	try {
		const highlights = await sendMessage("myz:getAllHighlights");
		state.highlights = Array.isArray(highlights) ? highlights : [];
		populateFilterOptions(state.highlights);
	} catch (error) {
		console.error("Failed to load highlights", error);
		groupsEl.innerHTML = `<p class="empty-state">加载失败：${error.message}</p>`;
		throw error;
	}
}

// Lightweight multiselect input that renders tag chips with suggestion dropdown.
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
	input.className = "tag-input__input";
	input.placeholder = settings.placeholder || "";

	const list = document.createElement("div");
	list.className = "tag-input__list is-hidden";
	list.setAttribute("role", "listbox");
	const listId = `${container.id || "tag-input"}-options-${Math.random().toString(36).slice(2, 8)}`;
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
		list.classList.add("is-hidden");
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
		container.querySelectorAll(".tag-input__chip").forEach((chip) => chip.remove());
		state.tags.forEach((tag) => {
			const chip = document.createElement("span");
			chip.className = "tag-input__chip";
			const label = document.createElement("span");
			label.textContent = tag;
			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "tag-input__remove";
			removeBtn.textContent = "x";
			removeBtn.dataset.tag = tag;
			removeBtn.setAttribute("aria-label", `移除标签 ${tag}`);
			removeBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				removeTag(tag);
			});
			chip.appendChild(label);
			chip.appendChild(removeBtn);
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
			optionEl.className = "tag-input__option";
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
			list.classList.remove("is-hidden");
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
		if (event.target === container || event.target.closest?.(".tag-input__chip")) {
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

function populateFilterOptions(highlights) {
	if (!siteSelect || !filterTagsContainer) {
		return;
	}
	const sites = [...new Set(highlights.map((item) => item.hostname).filter(Boolean))].sort();
	const previousSite = state.filters.site;
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
	siteSelect.value = previousSite || "";

	const tagSet = new Set();
	highlights.forEach((item) => {
		(item.tags || []).forEach((tag) => tagSet.add(tag));
	});
	const sortedTags = Array.from(tagSet).sort();
	state.availableTags = sortedTags;
	if (tagInputInstances.filter) {
		tagInputInstances.filter.setOptions(sortedTags);
		tagInputInstances.filter.setValue(state.filters.tags, { silent: true });
	}
	if (tagInputInstances.modal && typeof tagInputInstances.modal.setOptions === "function") {
		const modalValue = typeof tagInputInstances.modal.getValue === "function" ? tagInputInstances.modal.getValue() : [];
		const combined = new Set([...sortedTags, ...modalValue]);
		tagInputInstances.modal.setOptions(Array.from(combined).sort());
	}
}

function applyFilters(preserveProgress = false) {
	const searchRaw = searchInput ? searchInput.value.trim() : "";
	state.filters.search = searchRaw.toLowerCase();
	state.searchTerms = getSearchTerms(searchRaw);

	const { site, tags, from, to } = state.filters;
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
		if (state.filters.search) {
			const haystack = [item.text, item.note, (item.tags || []).join(" ")]
				.join(" ")
				.toLowerCase();
			if (!haystack.includes(state.filters.search)) {
				return false;
			}
		}
		return true;
	});

	const baseline = preserveProgress && state.pagination.rendered ? state.pagination.rendered : PAGINATION_BATCH;
	state.pagination.rendered = state.filtered.length ? Math.min(baseline, state.filtered.length) : 0;

	renderHighlights(getVisibleHighlights());
	updateSummary();
}

function getVisibleHighlights() {
	if (!state.filtered.length) {
		return [];
	}
	const limit = state.pagination.rendered || Math.min(PAGINATION_BATCH, state.filtered.length);
	return state.filtered.slice(0, limit);
}

function renderHighlights(highlights) {
	if (!groupsEl) {
		return;
	}
	groupsEl.dataset.view = state.view;
	if (infiniteObserver) {
		infiniteObserver.disconnect();
	}
	groupsEl.innerHTML = "";
	scrollSentinel.remove();

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

	if (state.pagination.rendered < state.filtered.length) {
		groupsEl.appendChild(scrollSentinel);
		setupInfiniteScroll();
		if (infiniteObserver) {
			infiniteObserver.observe(scrollSentinel);
		}
	}
}

function buildCard(record) {
	const instance = cardTemplate.content.cloneNode(true);
	const card = instance.querySelector(".card");
	card.dataset.id = record.id;
	card.classList.remove("card--single");

	const siteEl = card.querySelector(".card__site");
	siteEl.innerHTML = formatInline(record.hostname || record.url || "");

	const dateEl = card.querySelector(".card__date");
	dateEl.textContent = formatDateTime(record.createdAt);

	const quoteEl = card.querySelector(".card__quote");
	quoteEl.innerHTML = renderHighlightContent(record);

	const noteEl = card.querySelector(".card__note");
	if (record.note) {
		noteEl.classList.remove("is-empty");
		noteEl.innerHTML = formatNote(record.note);
	} else {
		noteEl.classList.add("is-empty");
		noteEl.innerHTML = "";
		card.classList.add("card--single");
	}

	const tagContainer = card.querySelector(".card__tags");
	tagContainer.innerHTML = "";
	if (record.tags && record.tags.length) {
		tagContainer.classList.remove("is-empty");
		record.tags.forEach((tag) => {
			const span = document.createElement("span");
			span.innerHTML = formatInline(tag);
			tagContainer.appendChild(span);
		});
	} else {
		tagContainer.classList.add("is-empty");
	}

	const link = card.querySelector("a.btn-link");
	link.href = record.sourceUrl || record.url;
	link.title = record.title || record.url;

	card.querySelectorAll("button[data-action]").forEach((button) => {
		button.dataset.id = record.id;
	});

	return instance;
}

function buildListRow(record) {
	const instance = listRowTemplate.content.cloneNode(true);
	const row = instance.querySelector(".list-row");
	row.dataset.id = record.id;

	row.querySelector(".list-row__date").textContent = formatDateTime(record.createdAt);
	row.querySelector(".list-row__site").innerHTML = formatInline(record.hostname || record.url || "");

	const quoteEl = row.querySelector(".list-row__quote");
	quoteEl.innerHTML = renderHighlightContent(record);

	const noteEl = row.querySelector(".list-row__note");
	if (record.note) {
		noteEl.classList.remove("is-empty");
		noteEl.innerHTML = formatNote(record.note);
	} else {
		noteEl.classList.add("is-empty");
		noteEl.innerHTML = "";
	}

	const tagContainer = row.querySelector(".list-row__tags");
	tagContainer.innerHTML = "";
	if (record.tags && record.tags.length) {
		tagContainer.classList.remove("is-empty");
		record.tags.forEach((tag) => {
			const span = document.createElement("span");
			span.innerHTML = formatInline(tag);
			tagContainer.appendChild(span);
		});
	} else {
		tagContainer.classList.add("is-empty");
	}

	const link = row.querySelector("a.btn-link");
	link.href = record.sourceUrl || record.url;
	link.title = record.title || record.url;

	row.querySelectorAll("button[data-action]").forEach((button) => {
		button.dataset.id = record.id;
	});

	return instance;
}

function updateSummary() {
	if (!summaryEl) {
		return;
	}
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
	if (searchInput) {
		searchInput.value = "";
	}
	if (siteSelect) {
		siteSelect.value = "";
	}
	if (tagInputInstances.filter) {
		tagInputInstances.filter.setValue([], { silent: true });
	}
	if (fromInput) {
		fromInput.value = "";
	}
	if (toInput) {
		toInput.value = "";
	}
	applyFilters();
}

function setView(view, { persist = true } = {}) {
	if (!view || state.view === view) {
		return;
	}
	state.view = view;
	updateViewToggle();
	renderHighlights(getVisibleHighlights());
	if (persist) {
		persistDashboardView(view);
	}
}

function updateViewToggle() {
	if (viewCardsBtn) {
		viewCardsBtn.classList.toggle("is-active", state.view === "cards");
	}
	if (viewListBtn) {
		viewListBtn.classList.toggle("is-active", state.view === "list");
	}
	if (groupsEl) {
		groupsEl.dataset.view = state.view;
	}
}

function persistDashboardView(view) {
	sendMessage("myz:updateSettings", { dashboardView: view }).catch((error) => {
		console.warn("Failed to persist view", error);
	});
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
	} else if (action === "view") {
		openRecordModal(id, "view");
	} else if (action === "edit") {
		openRecordModal(id, "edit");
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
		if (logseqStatusEl) {
			logseqStatusEl.textContent = "已复制到剪贴板";
			setTimeout(() => {
				logseqStatusEl.textContent = "";
			}, 2000);
		}
	} catch (error) {
		console.error("复制失败", error);
	}
}

async function deleteHighlight(id) {
	try {
		await sendMessage("myz:removeHighlight", { id });
		state.highlights = state.highlights.filter((item) => item.id !== id);
		populateFilterOptions(state.highlights);
		applyFilters(true);
	} catch (error) {
		console.error("删除失败", error);
	}
}

function openRecordModal(id, mode) {
	if (!modal.container) {
		return;
	}
	const record = state.highlights.find((item) => item.id === id);
	if (!record) {
		return;
	}
	modalState = { recordId: record.id, mode };

	if (modal.title) {
		modal.title.textContent = record.title || record.hostname || "标注详情";
	}
	if (modal.quote) {
		modal.quote.innerHTML = renderHighlightContent(record);
	}
	if (modal.noteDisplay) {
		modal.noteDisplay.innerHTML = record.note ? formatNote(record.note) : "无批注";
	}
	if (modal.noteInput) {
		modal.noteInput.value = record.note || "";
	}
	renderModalTags(record.tags || []);

	const colorValue = record.color || DEFAULT_COLOR;
	if (modal.colorSwatch) {
		modal.colorSwatch.style.background = colorValue;
	}
	if (modal.colorPicker) {
		modal.colorPicker.value = colorValue;
	}
	if (modal.tagsComponent) {
		const combined = new Set([...(state.availableTags || []), ...((record.tags || []))]);
		modal.tagsComponent.setOptions(Array.from(combined).sort());
		modal.tagsComponent.setValue(record.tags || [], { silent: true });
	}
	if (modal.status) {
		modal.status.textContent = "";
	}

	const isEdit = mode === "edit";
	if (modal.noteDisplay) {
		modal.noteDisplay.classList.toggle("is-hidden", isEdit);
	}
	if (modal.noteInput) {
		modal.noteInput.classList.toggle("is-hidden", !isEdit);
	}
	if (modal.tagsDisplay) {
		modal.tagsDisplay.classList.toggle("is-hidden", isEdit);
	}
	if (modal.tagsInput) {
		modal.tagsInput.classList.toggle("is-hidden", !isEdit);
	}
	if (modal.colorSwatch) {
		modal.colorSwatch.classList.toggle("is-hidden", isEdit);
	}
	if (modal.colorWrapper) {
		modal.colorWrapper.classList.toggle("is-hidden", !isEdit);
	}
	if (modal.saveButton) {
		modal.saveButton.classList.toggle("is-hidden", !isEdit);
	}
	if (modal.cancelButton) {
		modal.cancelButton.textContent = isEdit ? "取消" : "关闭";
	}

	modal.container.classList.remove("is-hidden");
}

function closeRecordModal() {
	if (modal.container) {
		modal.container.classList.add("is-hidden");
	}
	if (modal.status) {
		modal.status.textContent = "";
	}
	modalState = { recordId: null, mode: "view" };
}

async function handleModalSave() {
	if (!modalState.recordId) {
		return;
	}
	const note = modal.noteInput ? modal.noteInput.value.trim() : "";
	const tags = modal.tagsComponent ? modal.tagsComponent.getValue() : parseTags(modal.tagsInput ? modal.tagsInput.value : "");
	const color = modal.colorPicker ? modal.colorPicker.value || DEFAULT_COLOR : DEFAULT_COLOR;

	if (modal.saveButton) {
		modal.saveButton.disabled = true;
	}
	if (modal.status) {
		modal.status.textContent = "保存中…";
	}

	try {
		const updated = await sendMessage("myz:updateHighlight", {
			id: modalState.recordId,
			note,
			tags,
			color
		});
		applyUpdatedRecord(updated);
		if (modal.status) {
			modal.status.textContent = "保存成功";
		}
		setTimeout(() => {
			if (modal.status) {
				modal.status.textContent = "";
			}
			closeRecordModal();
		}, 600);
	} catch (error) {
		if (modal.status) {
			modal.status.textContent = `保存失败：${error.message}`;
		}
	} finally {
		if (modal.saveButton) {
			modal.saveButton.disabled = false;
		}
	}
}

function applyUpdatedRecord(updated) {
	const index = state.highlights.findIndex((item) => item.id === updated.id);
	if (index !== -1) {
		state.highlights[index] = { ...state.highlights[index], ...updated };
	}
	populateFilterOptions(state.highlights);
	applyFilters(true);
}

function renderModalTags(tags) {
	if (!modal.tagsDisplay) {
		return;
	}
	modal.tagsDisplay.innerHTML = "";
	if (!tags.length) {
		modal.tagsDisplay.textContent = "无标签";
		return;
	}
	tags.forEach((tag) => {
		const span = document.createElement("span");
		span.textContent = tag;
		modal.tagsDisplay.appendChild(span);
	});
}

function handleModalKeydown(event) {
	if (event.key === "Escape" && modal.container && !modal.container.classList.contains("is-hidden")) {
		closeRecordModal();
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

function loadMoreHighlights() {
	if (state.pagination.rendered >= state.filtered.length) {
		return;
	}
	state.pagination.rendered = Math.min(state.pagination.rendered + PAGINATION_BATCH, state.filtered.length);
	renderHighlights(getVisibleHighlights());
}

async function loadSettings() {
	try {
		const settings = await sendMessage("myz:getSettings");
		if (!settings) {
			return;
		}
		state.settings = {
			...state.settings,
			...settings
		};

		if (logseqEndpointInput) {
			logseqEndpointInput.value = settings.logseqEndpoint || "";
		}
		if (logseqTokenInput) {
			logseqTokenInput.value = settings.logseqAuthToken || "";
		}
		if (logseqGraphInput) {
			logseqGraphInput.value = settings.logseqGraph || "";
		}

		const enabled = Boolean(settings.logseqSyncEnabled);
		if (logseqSyncToggle) {
			logseqSyncToggle.checked = enabled;
		}
		updateLogseqFieldsState(enabled);
		updateSyncButtonVisibility();

		if (settings.dashboardView) {
			state.view = settings.dashboardView;
		}
		updateViewToggle();
	} catch (error) {
		console.error("Failed to load settings", error);
	}
}

function updateLogseqFieldsState(enabled) {
	if (logseqSettingsFields) {
		logseqSettingsFields.classList.toggle("is-disabled", !enabled);
	}
}

function updateSyncButtonVisibility() {
	if (!syncLogseqBtn) {
		return;
	}
	const visible = logseqSyncToggle ? logseqSyncToggle.checked : false;
	syncLogseqBtn.classList.toggle("is-hidden", !visible);
}

async function handleSyncToggle() {
	const enabled = logseqSyncToggle ? logseqSyncToggle.checked : false;
	state.settings.logseqSyncEnabled = enabled;
	updateLogseqFieldsState(enabled);
	updateSyncButtonVisibility();
	try {
		await sendMessage("myz:updateSettings", { logseqSyncEnabled: enabled });
	} catch (error) {
		console.error("Failed to update sync toggle", error);
		if (logseqSyncToggle) {
			logseqSyncToggle.checked = !enabled;
		}
		state.settings.logseqSyncEnabled = !enabled;
		updateLogseqFieldsState(state.settings.logseqSyncEnabled);
		updateSyncButtonVisibility();
		if (settingsStatusEl) {
			settingsStatusEl.textContent = `更新失败：${error.message}`;
			setTimeout(() => {
				settingsStatusEl.textContent = "";
			}, 3000);
		}
	}
}

async function saveSettings() {
	if (!settingsStatusEl) {
		return;
	}
	const payload = {
		logseqEndpoint: logseqEndpointInput ? logseqEndpointInput.value.trim() : "",
		logseqAuthToken: logseqTokenInput ? logseqTokenInput.value.trim() : "",
		logseqGraph: logseqGraphInput ? logseqGraphInput.value.trim() : "",
		logseqSyncEnabled: logseqSyncToggle ? logseqSyncToggle.checked : false
	};

	settingsStatusEl.textContent = "保存中…";
	try {
		const updated = await sendMessage("myz:updateSettings", payload);
		state.settings = {
			...state.settings,
			...updated
		};
		settingsStatusEl.textContent = "设置已保存";
	} catch (error) {
		settingsStatusEl.textContent = `保存失败：${error.message}`;
	} finally {
		setTimeout(() => {
			settingsStatusEl.textContent = "";
		}, 3000);
	}
}

async function syncLogseq() {
	if (!logseqSyncToggle || !logseqSyncToggle.checked) {
		if (logseqStatusEl) {
			logseqStatusEl.textContent = "请先在设置中启用同步";
			setTimeout(() => {
				logseqStatusEl.textContent = "";
			}, 3000);
		}
		return;
	}
	if (logseqStatusEl) {
		logseqStatusEl.textContent = "同步中…";
	}
	if (syncLogseqBtn) {
		syncLogseqBtn.disabled = true;
	}
	try {
		await sendMessage("myz:syncLogseq", { title: `MyZ Export ${new Date().toISOString()}` });
		if (logseqStatusEl) {
			logseqStatusEl.textContent = "同步成功";
		}
	} catch (error) {
		if (logseqStatusEl) {
			logseqStatusEl.textContent = `同步失败：${error.message}`;
		}
	} finally {
		if (syncLogseqBtn) {
			syncLogseqBtn.disabled = false;
		}
		if (logseqStatusEl) {
			setTimeout(() => {
				logseqStatusEl.textContent = "";
			}, 4000);
		}
	}
}

function showSettingsView() {
	if (state.panel === "settings") {
		return;
	}
	state.panel = "settings";
	if (openSettingsBtn) {
		openSettingsBtn.setAttribute("aria-expanded", "true");
	}
	if (highlightsView) {
		highlightsView.classList.remove("is-active");
		highlightsView.classList.add("is-hidden");
	}
	if (settingsView) {
		settingsView.classList.remove("is-hidden");
		settingsView.classList.add("is-active");
	}
	if (infiniteObserver) {
		infiniteObserver.disconnect();
	}
}

function showHighlightsView() {
	if (state.panel === "highlights") {
		return;
	}
	state.panel = "highlights";
	if (openSettingsBtn) {
		openSettingsBtn.setAttribute("aria-expanded", "false");
	}
	if (settingsView) {
		settingsView.classList.remove("is-active");
		settingsView.classList.add("is-hidden");
	}
	if (highlightsView) {
		highlightsView.classList.remove("is-hidden");
		highlightsView.classList.add("is-active");
	}
	renderHighlights(getVisibleHighlights());
}

function renderHighlightContent(record) {
	if (record.html) {
		return highlightTermsInHtml(record.html, state.searchTerms);
	}
	const escaped = escapeHtml(record.text || "");
	const withBreaks = escaped.replace(/\r?\n/g, "<br>");
	return applySearchHighlights(withBreaks);
}

function formatNote(value) {
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

function highlightTermsInHtml(html, terms) {
	if (!html || !terms.length) {
		return html;
	}
	const pattern = terms
		.map((term) => escapeRegExp(term))
		.filter(Boolean)
		.join("|");
	if (!pattern) {
		return html;
	}
	const container = document.createElement("div");
	container.innerHTML = html;
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
	const targets = [];
	let current;
	while ((current = walker.nextNode())) {
		if (current.parentNode && current.parentNode.closest("mark.search-hit")) {
			continue;
		}
		targets.push(current);
	}
	targets.forEach((node) => {
		const text = node.nodeValue;
		const nodeRegex = new RegExp(pattern, "gi");
		if (!nodeRegex.test(text)) {
			return;
		}
		nodeRegex.lastIndex = 0;
		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		let match;
		while ((match = nodeRegex.exec(text))) {
			if (match.index > lastIndex) {
				fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
			}
			const mark = document.createElement("mark");
			mark.className = "search-hit";
			mark.textContent = match[0];
			fragment.appendChild(mark);
			lastIndex = match.index + match[0].length;
		}
		if (lastIndex < text.length) {
			fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		}
		node.parentNode.replaceChild(fragment, node);
	});
	return container.innerHTML;
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
