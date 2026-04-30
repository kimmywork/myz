import type { DashboardTheme } from "@myz/dashboard-core/host";
import { computed, ref } from "vue";
import { desktopDashboardHost } from "../../host/desktop";

const FALLBACK_STORAGE_KEY = "myz:desktop-theme";
const themeRef = ref<DashboardTheme>("dark");
const readyRef = ref(false);
let initPromise: Promise<DashboardTheme> | null = null;
let bodyReady = false;

function detectSystemTheme(): DashboardTheme {
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

function applyThemeClasses(value: DashboardTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = value;
  root.style.colorScheme = value;
  root.classList.toggle("dark", value === "dark");
  root.classList.toggle("light", value === "light");

  const body = document.body;
  if (body) {
    bodyReady = true;
    body.dataset.theme = value;
    body.style.colorScheme = value;
    body.classList.toggle("dark", value === "dark");
    body.classList.toggle("light", value === "light");
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

function readFallbackTheme() {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const stored = localStorage.getItem(FALLBACK_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function persistFallbackTheme(value: DashboardTheme) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, value);
  } catch {
    // ignore local persistence errors
  }
}

export async function initializeThemePreference(): Promise<DashboardTheme> {
  const fromHost = await desktopDashboardHost.theme
    .getTheme()
    .catch(() => null);
  const next =
    fromHost === "light" || fromHost === "dark"
      ? fromHost
      : readFallbackTheme() || detectSystemTheme();
  themeRef.value = next;
  readyRef.value = true;
  applyThemeClasses(next);
  persistFallbackTheme(next);
  return next;
}

export function useThemePreference() {
  function initialize() {
    if (!initPromise) {
      initPromise = initializeThemePreference();
    }
    return initPromise;
  }

  if (typeof window !== "undefined") {
    initialize();
  }

  const isDark = computed(() => themeRef.value === "dark");

  async function setTheme(next: DashboardTheme) {
    const normalized = next === "light" ? "light" : "dark";
    themeRef.value = normalized;
    applyThemeClasses(normalized);
    persistFallbackTheme(normalized);
    try {
      await desktopDashboardHost.theme.setTheme(normalized);
    } catch (error) {
      console.warn("Failed to persist desktop theme", error);
    }
  }

  function toggleTheme() {
    void setTheme(isDark.value ? "light" : "dark");
  }

  return {
    theme: themeRef,
    ready: readyRef,
    isDark,
    initialize,
    setTheme,
    toggleTheme,
  };
}

if (typeof window !== "undefined") {
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
