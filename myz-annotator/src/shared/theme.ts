import { computed, ref } from "vue";

const THEME_STORAGE_KEY = "myz:theme";
const themeRef = ref("dark");
const readyRef = ref(false);
let initPromise: Promise<string> | null = null;
let listenerRegistered = false;
let bodyReady = false;

function detectSystemTheme() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyThemeClasses(value: string) {
  if (typeof document === "undefined") {
    return;
  }
  const normalized = value === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.dataset.theme = normalized;
  root.style.colorScheme = normalized;
  root.classList.toggle("dark", normalized === "dark");
  root.classList.toggle("light", normalized === "light");
  const body = document.body;
  if (body) {
    bodyReady = true;
    body.dataset.theme = normalized;
    body.style.colorScheme = normalized;
    body.classList.toggle("dark", normalized === "dark");
    body.classList.toggle("light", normalized === "light");
  } else if (!bodyReady) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        bodyReady = true;
        applyThemeClasses(themeRef.value);
      },
      { once: true },
    );
  }
}

function readStoredTheme() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        resolve(result?.[THEME_STORAGE_KEY] || null);
      });
      return;
    }
    if (typeof localStorage !== "undefined") {
      resolve(localStorage.getItem(THEME_STORAGE_KEY));
      return;
    }
    resolve(null);
  });
}

function persistTheme(value: string) {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: value });
    } catch {
      // ignore
    }
    return;
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }
}

async function initTheme(): Promise<string> {
  const stored = await readStoredTheme();
  const next =
    stored === "light" || stored === "dark" ? stored : detectSystemTheme();
  themeRef.value = next;
  applyThemeClasses(next);
  readyRef.value = true;
  registerStorageListener();
  return next;
}

function ensureInitialized() {
  if (!initPromise) {
    initPromise = initTheme();
  }
  return initPromise;
}

function registerStorageListener() {
  if (listenerRegistered) {
    return;
  }
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.onChanged ||
    typeof chrome.storage.onChanged.addListener !== "function"
  ) {
    return;
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes?.[THEME_STORAGE_KEY]) {
      return;
    }
    const nextValue = changes[THEME_STORAGE_KEY].newValue;
    if (nextValue !== "light" && nextValue !== "dark") {
      return;
    }
    themeRef.value = nextValue;
    applyThemeClasses(nextValue);
  });
  listenerRegistered = true;
}

export function useThemePreference() {
  if (typeof window !== "undefined") {
    ensureInitialized();
  }
  const isDark = computed(() => themeRef.value === "dark");
  function setTheme(next: string) {
    const normalized = next === "light" ? "light" : "dark";
    themeRef.value = normalized;
    applyThemeClasses(normalized);
    persistTheme(normalized);
  }
  function toggleTheme() {
    setTheme(isDark.value ? "light" : "dark");
  }
  return {
    theme: themeRef,
    ready: readyRef,
    isDark,
    setTheme,
    toggleTheme,
  };
}

if (typeof window !== "undefined") {
  ensureInitialized();
  if (document.readyState !== "loading") {
    bodyReady = true;
    applyThemeClasses(themeRef.value);
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        bodyReady = true;
        applyThemeClasses(themeRef.value);
      },
      { once: true },
    );
  }
}
