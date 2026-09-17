import { computed, ref } from "vue"
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_OPTIONS,
  DEFAULT_COLOR_SCHEME,
} from "./enums"
import { sendMessage } from "./messaging"

/**
 * Product color scheme (paper / slate / celadon / ochre).
 *
 * The value is persisted inside the Settings bundle (`myz::settings`), so the
 * background worker is the single writer. Every host applies it by setting
 * `data-scheme` on `<html>` and `<body>`; the token stylesheet reacts to that
 * attribute. This mirrors `theme.ts`, which handles light/dark the same way.
 */

export type ColorScheme = COLOR_SCHEMES

const SETTINGS_STORAGE_KEY = "myz::settings"
const LOCAL_FALLBACK_KEY = "myz:color-scheme"

const schemeRef = ref<ColorScheme>(DEFAULT_COLOR_SCHEME)
const readyRef = ref(false)
let initPromise: Promise<ColorScheme> | null = null
let listenerRegistered = false
let bodyReady = false

export function isColorScheme(value: unknown): value is ColorScheme {
  return (
    typeof value === "string" &&
    (Object.values(COLOR_SCHEMES) as string[]).includes(value)
  )
}

function applyScheme(value: ColorScheme) {
  schemeRef.value = value
  if (typeof document === "undefined") {
    return
  }
  const root = document.documentElement
  root.dataset.scheme = value
  const body = document.body
  if (body) {
    bodyReady = true
    body.dataset.scheme = value
  } else if (!bodyReady) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        bodyReady = true
        const current = document.body
        if (current) {
          current.dataset.scheme = schemeRef.value
        }
      },
      { once: true },
    )
  }
}

function readSchemeFromBundle(stored: unknown): ColorScheme | null {
  if (!stored || typeof stored !== "object") {
    return null
  }
  const value = (stored as { data?: { colorScheme?: unknown } }).data
    ?.colorScheme
  return isColorScheme(value) ? value : null
}

function readStoredScheme(): Promise<ColorScheme | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
        resolve(readSchemeFromBundle(result?.[SETTINGS_STORAGE_KEY]))
      })
      return
    }
    if (typeof localStorage !== "undefined") {
      const value = localStorage.getItem(LOCAL_FALLBACK_KEY)
      resolve(isColorScheme(value) ? value : null)
      return
    }
    resolve(null)
  })
}

function persistScheme(value: ColorScheme) {
  if (typeof chrome !== "undefined" && chrome.runtime) {
    void sendMessage<{ colorScheme: ColorScheme }>("myz:updateSettings", {
      colorScheme: value,
    }).catch(() => undefined)
    return
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCAL_FALLBACK_KEY, value)
  }
}

function registerStorageListener() {
  if (typeof chrome === "undefined" || !chrome.storage) {
    return
  }
  if (listenerRegistered) {
    return
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]) {
      return
    }
    const next = readSchemeFromBundle(changes[SETTINGS_STORAGE_KEY].newValue)
    if (next) {
      applyScheme(next)
    }
  })
  listenerRegistered = true
}

async function initScheme(): Promise<ColorScheme> {
  const stored = await readStoredScheme()
  const next = stored ?? DEFAULT_COLOR_SCHEME
  applyScheme(next)
  readyRef.value = true
  registerStorageListener()
  return next
}

function ensureInitialized(): Promise<ColorScheme> {
  if (!initPromise) {
    initPromise = initScheme()
  }
  return initPromise
}

export function useColorScheme() {
  void ensureInitialized()

  function setScheme(next: ColorScheme) {
    if (!isColorScheme(next)) {
      return
    }
    applyScheme(next)
    persistScheme(next)
  }

  return {
    scheme: schemeRef,
    ready: readyRef,
    options: computed(() => COLOR_SCHEME_OPTIONS),
    setScheme,
  }
}

if (typeof window !== "undefined") {
  void ensureInitialized()
  if (document.readyState !== "loading") {
    bodyReady = true
    applyScheme(schemeRef.value)
  }
}
