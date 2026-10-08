import {
  sanitizeEpubXhtml,
  type EpubBook,
  type EpubSpineItem,
} from "./parse.js";

export interface ReadTokens {
  bg: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  read: string;
  readSize: string;
  readLeading: string;
  readTracking: string;
  readMeasure: string;
  readGutter: string;
}

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function decodePath(href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/**
 * Resolves an in-zip asset path. A leading `/` means archive root, matching
 * `parse.ts`'s `resolveHref`; everything else is relative to the document.
 */
export function resolveAssetPath(baseDir: string, href: string): string {
  const decoded = decodePath(href);
  if (decoded.startsWith("/")) {
    return joinPath("", decoded);
  }
  return joinPath(baseDir, decoded);
}

function joinPath(baseDir: string, relative: string): string {
  const parts = `${baseDir ? `${baseDir}/` : ""}${relative}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  css: "text/css",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

function mediaTypeFor(book: EpubBook, path: string): string {
  const item = book.manifest.find((entry) => entry.href === path);
  if (item?.mediaType) {
    return item.mediaType;
  }
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return MEDIA_TYPES[ext] || "application/octet-stream";
}

/** Creates (and caches) a blob url for an in-zip resource. */
export function resourceUrl(
  book: EpubBook,
  path: string,
  cache: Map<string, string>,
): string | null {
  const cached = cache.get(path);
  if (cached) {
    return cached;
  }
  const bytes = book.files.get(path);
  if (!bytes) {
    return null;
  }
  // Blob copies the view's bytes directly; slicing to a standalone ArrayBuffer
  // first would copy the resource twice.
  const url = URL.createObjectURL(
    new Blob([bytes], { type: mediaTypeFor(book, path) }),
  );
  cache.set(path, url);
  return url;
}

/** Reads the resolved read tokens from the reader page so the iframe matches. */
export function readReadTokens(): ReadTokens {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  // `--myz-read` is `Newsreader, var(--myz-cjk), serif`; reading the raw
  // custom-property string and pasting it into the iframe (which has no
  // `--myz-cjk`) makes the whole declaration invalid. Resolve it to a concrete
  // font stack through a probe element.
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  probe.style.fontFamily = "var(--myz-read)";
  const resolvedRead = getComputedStyle(probe).fontFamily;
  probe.remove();

  return {
    bg: get("--myz-bg", "#f5f4ed"),
    text: get("--myz-text", "#141413"),
    muted: get("--myz-muted", "#6b6a64"),
    line: get("--myz-line", "#ddd9cc"),
    accent: get("--myz-accent-text", "#1b365d"),
    read: resolvedRead || "serif",
    readSize: get("--myz-read-size-3", "18px"),
    readLeading: get("--myz-read-leading", "1.8"),
    readTracking: get("--myz-read-tracking", "0.01em"),
    readMeasure: get("--myz-read-measure", "38em"),
    readGutter: get("--myz-read-gutter", "24px"),
  };
}

/** §4.16 reading typography, inlined because the iframe has no token sheet. */
export function buildReadCss(tokens: ReadTokens): string {
  // The book's own stylesheet frequently restates body layout (e.g. PG's
  // `body.x-ebookmaker-coverpage { margin: 0 }`), which would left-align the
  // column and un-center the cover. The reader owns this chrome, so the body
  // layout and font are forced with `!important`.
  return `
:root { color-scheme: light dark; }
html, body { background: ${tokens.bg} !important; }
body {
  color: ${tokens.text} !important;
  font-family: ${tokens.read} !important;
  font-size: ${tokens.readSize} !important;
  line-height: ${tokens.readLeading} !important;
  letter-spacing: ${tokens.readTracking} !important;
  max-width: ${tokens.readMeasure} !important;
  margin: 0 auto !important;
  padding: ${tokens.readGutter} ${tokens.readGutter} 64px !important;
  overflow-wrap: break-word;
}
img, video, svg, figure {
  max-width: 100% !important;
  height: auto !important;
  display: block;
  margin-left: auto !important;
  margin-right: auto !important;
}
a { color: ${tokens.accent}; }
hr { border: 0; border-top: 1px solid ${tokens.line}; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid ${tokens.line}; color: ${tokens.muted}; }
figure { margin: 1em 0; }
::selection { background: color-mix(in srgb, ${tokens.accent} 30%, transparent); }
.myz-highlight { cursor: pointer; }
.myz-highlight--paint {
  background: color-mix(in srgb, var(--myz-highlight-color, ${tokens.accent}) 42%, transparent);
  border-radius: 3px;
  padding: 0 2px;
  color: inherit;
}
.myz-highlight--paint:hover {
  background: color-mix(in srgb, var(--myz-highlight-color, ${tokens.accent}) 55%, transparent);
}
.myz-highlight--underline,
.myz-highlight--wavy {
  background: none;
  color: inherit;
  text-decoration-line: underline;
  text-decoration-color: var(--myz-highlight-color, ${tokens.accent});
}
.myz-highlight--underline { text-decoration-style: solid; text-decoration-thickness: 2px; text-underline-offset: 0.12em; }
.myz-highlight--wavy { text-decoration-style: wavy; text-decoration-thickness: 1.5px; text-underline-offset: 0.16em; }
`.trim();
}

function rewriteCssUrls(
  css: string,
  cssDir: string,
  book: EpubBook,
  cache: Map<string, string>,
): string {
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (match, _quote, rawValue: string) => {
      const value = rawValue.trim();
      if (/^(data:|blob:|https?:|\/\/)/i.test(value)) {
        return match;
      }
      const resolved = resolveAssetPath(cssDir, value);
      const url = resourceUrl(book, resolved, cache);
      return url ? `url("${url}")` : match;
    },
  );
}

function inlineStylesheets(
  doc: Document,
  baseDir: string,
  book: EpubBook,
  cache: Map<string, string>,
): void {
  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const href = link.getAttribute("href") || "";
    const resolved = resolveAssetPath(baseDir, href);
    const bytes = book.files.get(resolved);
    if (!bytes) {
      link.remove();
      return;
    }
    const style = doc.createElement("style");
    const text = new TextDecoder().decode(bytes);
    style.textContent = rewriteCssUrls(text, dirOf(resolved), book, cache);
    link.replaceWith(style);
  });
}

/**
 * Builds the full HTML for one spine document: resources rewritten to blob
 * urls, linked stylesheets inlined, scripts stripped, and the read typography
 * injected so the iframe looks like the rest of the product.
 */
export function buildSpineHtml(
  book: EpubBook,
  spineItem: EpubSpineItem,
  tokens: ReadTokens,
  cache: Map<string, string>,
): string {
  const bytes = book.files.get(spineItem.href);
  if (!bytes) {
    return `<!doctype html><html><body><p>缺少章节文件：${spineItem.href}</p></body></html>`;
  }
  const baseDir = dirOf(spineItem.href);
  const source = new TextDecoder().decode(bytes);
  // XML parsing never throws: malformed XHTML yields a <parsererror> document
  // instead, so check for it and fall back to HTML parsing.
  let doc = new DOMParser().parseFromString(source, "application/xhtml+xml");
  if (!doc.documentElement || doc.querySelector("parsererror")) {
    doc = new DOMParser().parseFromString(source, "text/html");
  }
  if (!doc.documentElement) {
    return `<!doctype html><html><body><p>无法解析章节：${spineItem.href}</p></body></html>`;
  }
  sanitizeEpubXhtml(doc);
  inlineStylesheets(doc, baseDir, book, cache);

  doc.querySelectorAll("img[src], image").forEach((el) => {
    const isSvgImage = el.localName === "image";
    const attr = isSvgImage
      ? el.getAttribute("href") || el.getAttribute("xlink:href") || ""
      : el.getAttribute("src") || "";
    const resolved = resolveAssetPath(baseDir, attr);
    const url = resourceUrl(book, resolved, cache);
    if (!url) {
      return;
    }
    if (isSvgImage) {
      // SVG2 uses a plain `href`; older EPUBs use `xlink:href`. Rewrite
      // whichever the document already has.
      if (el.hasAttribute("href")) {
        el.setAttribute("href", url);
      }
      if (el.hasAttribute("xlink:href")) {
        el.setAttribute("xlink:href", url);
      }
    } else {
      el.setAttribute("src", url);
    }
  });

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return;
    }
    // Internal links are handled through the TOC for now; neutralize the raw
    // relative href so it cannot navigate the iframe to a missing path.
    anchor.setAttribute("data-epub-href", href);
    anchor.setAttribute("href", "#");
  });

  const head = doc.querySelector("head") || doc.documentElement;
  const style = doc.createElement("style");
  style.textContent = buildReadCss(tokens);
  head.appendChild(style);

  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
