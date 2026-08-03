import { computed, ref } from "vue";

const THEME_STORAGE_KEY = "myz:theme";
type ThemeMode = "auto" | "light" | "dark";
const modeRef = ref<ThemeMode>("auto");
const readyRef = ref(false);
let initPromise: Promise<ThemeMode> | null = null;
let listenerRegistered = false;
let bodyReady = false;
let systemListener: (() => void) | null = null;

function detectSystemTheme(): "light" | "dark" {
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

function applyThemeClasses(value: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }
  const normalized = value;
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
        applyEffectiveTheme();
      },
      { once: true },
    );
  }
}

function applyEffectiveTheme() {
  const effective = getEffectiveTheme();
  applyThemeClasses(effective);
}

function getEffectiveTheme(): "light" | "dark" {
  if (modeRef.value === "light") {
    return "light";
  }
  if (modeRef.value === "dark") {
    return "dark";
  }
  return detectSystemTheme();
}

function readStoredTheme(): Promise<ThemeMode | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        const value = result?.[THEME_STORAGE_KEY];
        resolve(value === "light" || value === "dark" || value === "auto" ? value : null);
      });
      return;
    }
    if (typeof localStorage !== "undefined") {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      resolve(value === "light" || value === "dark" || value === "auto" ? value : null);
      return;
    }
    resolve(null);
  });
}

function persistTheme(value: ThemeMode) {
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

function clearSystemListener() {
  if (systemListener && typeof window !== "undefined" && window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: light)").removeEventListener("change", systemListener);
    } catch {
      // ignore
    }
    systemListener = null;
  }
}

function ensureSystemListener() {
  if (systemListener) {
    return;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  systemListener = () => {
    if (modeRef.value === "auto") {
      applyEffectiveTheme();
    }
  };
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", systemListener);
}

async function initTheme(): Promise<ThemeMode> {
  const stored = await readStoredTheme();
  const next: ThemeMode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  modeRef.value = next;
  applyEffectiveTheme();
  readyRef.value = true;
  registerStorageListener();
  if (next === "auto") {
    ensureSystemListener();
  }
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
    if (nextValue !== "light" && nextValue !== "dark" && nextValue !== "auto") {
      return;
    }
    modeRef.value = nextValue;
    if (nextValue === "auto") {
      ensureSystemListener();
    } else {
      clearSystemListener();
    }
    applyEffectiveTheme();
  });
  listenerRegistered = true;
}

export function useThemePreference() {
  if (typeof window !== "undefined") {
    ensureInitialized();
  }
  const isDark = computed(() => getEffectiveTheme() === "dark");
  function setTheme(next: ThemeMode) {
    modeRef.value = next;
    if (next === "auto") {
      ensureSystemListener();
    } else {
      clearSystemListener();
    }
    applyEffectiveTheme();
    persistTheme(next);
  }
  function toggleTheme() {
    const current = getEffectiveTheme();
    setTheme(current === "dark" ? "light" : "dark");
  }
  return {
    mode: modeRef,
    ready: readyRef,
    isDark,
    effectiveTheme: computed(() => getEffectiveTheme()),
    setTheme,
    toggleTheme,
  };
}

if (typeof window !== "undefined") {
  ensureInitialized();
  if (document.readyState !== "loading") {
    bodyReady = true;
    applyEffectiveTheme();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        bodyReady = true;
        applyEffectiveTheme();
      },
      { once: true },
    );
  }
}
