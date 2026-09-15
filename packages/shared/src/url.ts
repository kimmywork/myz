import { PDF_SOURCE_URL_PREFIX } from "./enums"

/**
 * Builds the synthetic source url used to identify a local PDF by its
 * content fingerprint. Kept in the `url` field so the existing url index,
 * grouping and viewer keep working unchanged.
 */
export function buildPdfSourceUrl(fingerprint: string): string {
  return `${PDF_SOURCE_URL_PREFIX}${fingerprint}`
}

export function isPdfSourceUrl(url: unknown): boolean {
  return typeof url === "string" && url.startsWith(PDF_SOURCE_URL_PREFIX)
}

/** Extracts the fingerprint from a synthetic local PDF source url. */
export function pdfFingerprintFromSourceUrl(url: unknown): string | null {
  return isPdfSourceUrl(url)
    ? (url as string).slice(PDF_SOURCE_URL_PREFIX.length)
    : null
}

const PDF_VIEWER_PREFIXES = [
  "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/",
  "extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/",
]

/**
 * Extracts the underlying PDF url from a browser tab url.
 * Handles direct `.pdf` navigation and the built-in PDF viewer urls
 * (`.../index.html?file=<encoded>`), which is what Chrome/Edge expose.
 */
export function extractPdfUrlFromBrowserUrl(
  browserUrl: unknown,
): string | null {
  if (typeof browserUrl !== "string" || !browserUrl) {
    return null
  }
  if (PDF_VIEWER_PREFIXES.some((prefix) => browserUrl.startsWith(prefix))) {
    const match = browserUrl.match(/[?&]file=([^&]+)/)
    if (!match) {
      return null
    }
    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }
  try {
    const parsed = new URL(browserUrl)
    if (/\.pdf$/i.test(parsed.pathname)) {
      return parsed.toString()
    }
  } catch {
    if (/\.pdf(\?.*)?$/i.test(browserUrl)) {
      return browserUrl
    }
  }
  return null
}

export function canonicalUrl(url?: string): string {
  return normalizeUrlValue(url)
}

export function buildUrlAliases(rawUrl: string, canonical: string): string[] {
  const aliases = new Set<string>()
  if (typeof rawUrl === "string" && rawUrl) {
    aliases.add(rawUrl)
    aliases.add(stripHash(rawUrl))
    aliases.add(normalizeUrlValue(rawUrl))
  }
  if (typeof canonical === "string" && canonical) {
    aliases.add(canonical)
  }

  return Array.from(aliases).filter(Boolean)
}

export function normalizeUrlValue(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || !rawUrl) {
    return ""
  }
  try {
    const instance = new URL(rawUrl)
    instance.hash = ""
    stripTrackingSearchParams(instance)
    return instance.toString()
  } catch (error) {
    return stripHash(rawUrl)
  }
}

function stripTrackingSearchParams(urlObject: URL | null) {
  if (!urlObject || !urlObject.searchParams) {
    return
  }
  const removableKeys = [
    "ref",
    "ref_src",
    "t",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
  ]
  removableKeys.forEach((key) => urlObject.searchParams.delete(key))
  Array.from(urlObject.searchParams.keys()).forEach((key) => {
    if (/^utm_/i.test(key)) {
      urlObject.searchParams.delete(key)
    }
  })
}

function stripHash(url: string) {
  if (typeof url !== "string") {
    return ""
  }
  const hashIndex = url.indexOf("#")
  if (hashIndex === -1) {
    return url
  }
  return url.slice(0, hashIndex)
}

export function extractHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch (error) {
    return url
  }
}

export function truncateText(text: string, max = 36) {
  if (!text) {
    return ""
  }
  return text.length > max ? `${text.slice(0, max)}…` : text
}
