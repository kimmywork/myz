/// <reference types="chrome" />
import "./style.css";
import { LANGUAGE_STORAGE_KEY } from "../shared/constants";
import { t, getCurrentLanguage, setLanguage, onLanguageChange, type Language } from "../shared/i18n";

interface DanmakuEntry {
  id: string;
  videoId: string;
  content: string;
  seconds: number;
  author: string;
  publishedText: string;
  likeCount: number;
  isPinned: boolean;
}

type StatusTone = "info" | "ready" | "error";

const statusElement = document.querySelector<HTMLElement>('[data-role="status"]');
const listElement = document.querySelector<HTMLUListElement>('[data-role="list"]');
const refreshButton = document.querySelector<HTMLButtonElement>('[data-role="refresh"]');
const settingsButton = document.querySelector<HTMLButtonElement>('[data-role="settings"]');
const languageModal = document.getElementById('languageModal') as HTMLDivElement;
const modalBackdrop = document.querySelector<HTMLElement>('[data-role="modal-backdrop"]');
const modalCloseButton = document.querySelector<HTMLButtonElement>('[data-role="modal-close"]');
const saveLanguageButton = document.querySelector<HTMLButtonElement>('[data-role="save-language"]');
const cancelLanguageButton = document.querySelector<HTMLButtonElement>('[data-role="cancel-language"]');
const languageRadioButtons = document.querySelectorAll<HTMLInputElement>('input[name="language"]');



async function getStoredLanguage(): Promise<Language> {
  try {
    const result = await chrome.storage.sync.get(LANGUAGE_STORAGE_KEY);
    return (result[LANGUAGE_STORAGE_KEY] as Language) || 'zh_CN';
  } catch {
    return 'zh_CN';
  }
}

async function saveLanguage(language: Language): Promise<void> {
  try {
    await chrome.storage.sync.set({ [LANGUAGE_STORAGE_KEY]: language });
  } catch (error) {
    console.warn('Failed to save language preference:', error);
  }
}

function updateHtmlLangAttribute(language: Language): void {
  const html = document.documentElement;
  const langMap: Record<Language, string> = {
    'zh_CN': 'zh-Hans',
    'en': 'en'
  };
  html.lang = langMap[language] || 'zh-Hans';
}

// Initialize i18n for static elements
function initializeI18n(): void {
  // Update static text elements
  const elements = document.querySelectorAll<HTMLElement>("[data-i18n]");
  elements.forEach(element => {
    const key = element.dataset.i18n;
    if (key) {
      const text = t(key);
      if (text && text !== key) {
        element.textContent = text;
      }
    }
  });

  // Update aria-label attributes
  const ariaElements = document.querySelectorAll<HTMLElement>("[data-i18n-aria]");
  ariaElements.forEach(element => {
    const key = element.dataset.i18nAria;
    if (key) {
      const text = t(key);
      if (text && text !== key) {
        element.setAttribute("aria-label", text);
      }
    }
  });
  
  // Update page title
  document.title = t('extensionDefaultTitle');
}

function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function setStatus(message: string, tone: StatusTone = "info"): void {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
}

function clearList(): void {
  if (!listElement) {
    return;
  }
  while (listElement.firstChild) {
    listElement.removeChild(listElement.firstChild);
  }
}

function renderEntries(entries: DanmakuEntry[]): void {
  if (!statusElement || !listElement) {
    return;
  }
  clearList();
  setStatus(t("danmakuCount", String(entries.length)), "ready");

  entries.forEach(entry => {
    const item = document.createElement("li");
    item.className = "popup__item";
    item.dataset.id = entry.id;

    const header = document.createElement("div");
    header.className = "popup__item-header";

    const timestamp = document.createElement("span");
    timestamp.className = "popup__timestamp";
    timestamp.textContent = formatTimestamp(entry.seconds);
    timestamp.title = entry.publishedText || "";

    const author = document.createElement("span");
    author.className = "popup__author";
    author.textContent = entry.author || t("anonymousAuthor");

    header.appendChild(timestamp);
    header.appendChild(author);

    if (entry.isPinned) {
      const badge = document.createElement("span");
      badge.className = "popup__badge popup__badge--pin";
      badge.textContent = t("pinnedBadge");
      header.appendChild(badge);
    }

    if (entry.likeCount > 0) {
      const likes = document.createElement("span");
      likes.className = "popup__meta popup__meta--likes";
      likes.textContent = t("likeCount", String(entry.likeCount));
      header.appendChild(likes);
    }

    item.appendChild(header);

    const body = document.createElement("p");
    body.className = "popup__content";
    body.textContent = entry.content;
    item.appendChild(body);

    listElement.appendChild(item);
  });
}

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, fallbackTabs => {
        resolve(fallbackTabs[0] ?? null);
      });
    });
  });
}

function extractVideoIdFromUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const idCandidate = parsed.pathname.replace(/^\//, "").trim();
      return idCandidate.length > 0 ? idCandidate : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const idCandidate = parsed.searchParams.get("v");
      if (idCandidate) {
        return idCandidate.trim() || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchDanmakuEntries(videoId?: string | null): Promise<DanmakuEntry[]> {
  const payload: { type: "danmaku:popup-data"; videoId?: string } = {
    type: "danmaku:popup-data"
  };
  if (videoId) {
    payload.videoId = videoId;
  }
  const response = await chrome.runtime.sendMessage(payload);
  if (response?.ok && Array.isArray(response.danmaku)) {
    return [...response.danmaku].filter((entry: DanmakuEntry) => entry && typeof entry.id === "string");
  }
  return [];
}

function sortEntries(entries: DanmakuEntry[]): DanmakuEntry[] {
  return entries
    .filter(entry => typeof entry.seconds === "number" && Number.isFinite(entry.seconds))
    .slice()
    .sort((a, b) => a.seconds - b.seconds);
}

async function loadDanmaku(showSpinner = true): Promise<void> {
  if (showSpinner) {
    setStatus(t("loadingStatus"), "info");
    clearList();
  }

  try {
    const tab = await queryActiveTab();
    const videoId = extractVideoIdFromUrl(tab?.url);
    const entries = sortEntries(await fetchDanmakuEntries(videoId));
    if (entries.length === 0) {
      if (!videoId) {
        setStatus(t("notVideoPage"), "info");
        clearList();
        return;
      }
      setStatus(t("noDanmakuAvailable"), "info");
      clearList();
      return;
    }
    renderEntries(entries);
  } catch (error) {
    console.error("MyZ Danmaku popup: failed to load entries", error);
    setStatus(t("loadError"), "error");
    clearList();
  }
}

// Modal functions
function openLanguageModal(): void {
  languageModal.classList.add('is-open');
  languageModal.setAttribute('aria-hidden', 'false');
  
  // Set current language as checked
  languageRadioButtons.forEach(radio => {
    radio.checked = radio.value === getCurrentLanguage();
  });
  
  // Focus on the modal
  modalCloseButton?.focus();
}

function closeLanguageModal(): void {
  languageModal.classList.remove('is-open');
  languageModal.setAttribute('aria-hidden', 'true');
}

function saveLanguageSelection(): void {
  const selectedLanguage = Array.from(languageRadioButtons).find(radio => radio.checked)?.value as Language;
  if (selectedLanguage && selectedLanguage !== getCurrentLanguage()) {
    setLanguage(selectedLanguage);
    updateHtmlLangAttribute(selectedLanguage);
    void saveLanguage(selectedLanguage);
    
    // Re-initialize UI with new language
    initializeI18n();
    
    // Refresh the danmaku list to update dynamic content
    void loadDanmaku(false);
  }
  closeLanguageModal();
}

// Event listeners
refreshButton?.addEventListener("click", () => {
  void loadDanmaku(false);
});

settingsButton?.addEventListener("click", () => {
  openLanguageModal();
});

modalCloseButton?.addEventListener("click", closeLanguageModal);
modalBackdrop?.addEventListener("click", closeLanguageModal);
saveLanguageButton?.addEventListener("click", saveLanguageSelection);
cancelLanguageButton?.addEventListener("click", closeLanguageModal);

// Handle Escape key to close modal
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && languageModal.classList.contains('is-open')) {
    closeLanguageModal();
  }
});

// Initialize
async function initialize() {
  // Get stored language preference
  const storedLanguage = await getStoredLanguage();
  setLanguage(storedLanguage);
  updateHtmlLangAttribute(storedLanguage);
  
  // Listen for language changes
  onLanguageChange(() => {
    initializeI18n();
    void loadDanmaku(false);
  });
  
  // Initialize i18n
  initializeI18n();
  
  // Load danmaku
  void loadDanmaku();
}

void initialize();