import { strFromU8, unzipSync, type Unzipped } from "fflate";
import UnzipWorker from "./unzip.worker?worker";

/**
 * EPUB parsing (EPUB plan E2). Turns the archive into a stable model the
 * reader can render without touching the zip again: metadata, manifest, spine
 * documents, table of contents (EPUB3 nav with an EPUB2 NCX fallback), cover
 * and every resource keyed by its normalized in-zip path.
 */

export const XHTML_MEDIA_TYPE = "application/xhtml+xml";
export const NCX_MEDIA_TYPE = "application/x-dtbncx+xml";

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  identifier: string;
  publisher: string;
  spineCount: number;
}

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface EpubSpineItem {
  idref: string;
  href: string;
  linear: boolean;
}

export interface EpubTocEntry {
  label: string;
  href: string;
  depth: number;
  children: EpubTocEntry[];
}

export interface EpubBook {
  opfPath: string;
  opfDir: string;
  metadata: EpubMetadata;
  manifest: EpubManifestItem[];
  spine: EpubSpineItem[];
  toc: EpubTocEntry[];
  coverPath: string | null;
  files: Map<string, Uint8Array<ArrayBuffer>>;
}

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Collapses `.`/`..` and duplicate slashes so lookups are stable. */
export function normalizeZipPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
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

/** Resolves a manifest/`src` href against the directory that holds it. */
export function resolveHref(baseDir: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  const decoded = (() => {
    try {
      return decodeURIComponent(clean);
    } catch {
      return clean;
    }
  })();
  if (!decoded) {
    return normalizeZipPath(baseDir);
  }
  if (decoded.startsWith("/")) {
    return normalizeZipPath(decoded);
  }
  return normalizeZipPath(baseDir ? `${baseDir}/${decoded}` : decoded);
}

function decodeXml(source: Uint8Array): Document {
  return new DOMParser().parseFromString(strFromU8(source), "application/xml");
}

function firstByLocalName(doc: Document, localName: string): Element | null {
  const all = doc.getElementsByTagNameNS("*", localName);
  return all.length ? all[0] : null;
}

function allByLocalName(doc: Document, localName: string): Element[] {
  return Array.from(doc.getElementsByTagNameNS("*", localName));
}

function textOf(doc: Document, localName: string): string {
  return firstByLocalName(doc, localName)?.textContent?.trim() || "";
}

function attrByLocalName(el: Element, localName: string): string {
  for (const attr of Array.from(el.attributes)) {
    if (attr.localName === localName) {
      return attr.value;
    }
  }
  return "";
}

function opfPathFromContainer(files: Map<string, Uint8Array>): string {
  const container = files.get("META-INF/container.xml");
  if (!container) {
    throw new Error("不是有效的 EPUB：缺少 META-INF/container.xml");
  }
  const doc = decodeXml(container);
  const rootfile = doc.querySelector("rootfile");
  const fullPath = rootfile?.getAttribute("full-path") || "";
  if (!fullPath) {
    throw new Error("不是有效的 EPUB：container.xml 未指向 OPF");
  }
  return normalizeZipPath(fullPath);
}

function readManifest(doc: Document, opfDir: string): EpubManifestItem[] {
  const items = allByLocalName(doc, "item");
  return items.map((item) => {
    const href = item.getAttribute("href") || "";
    return {
      id: item.getAttribute("id") || "",
      href: resolveHref(opfDir, href),
      mediaType: item.getAttribute("media-type") || "",
      properties: (item.getAttribute("properties") || "")
        .split(/\s+/)
        .filter(Boolean),
    };
  });
}

function readSpine(
  doc: Document,
  manifest: EpubManifestItem[],
): EpubSpineItem[] {
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const itemrefs = allByLocalName(doc, "itemref");
  const spine: EpubSpineItem[] = [];
  for (const ref of itemrefs) {
    const idref = ref.getAttribute("idref") || "";
    const item = byId.get(idref);
    if (!item) {
      continue;
    }
    spine.push({
      idref,
      href: item.href,
      linear: ref.getAttribute("linear") !== "no",
    });
  }
  return spine;
}

function parseNavList(list: Element): EpubTocEntry[] {
  const entries: EpubTocEntry[] = [];
  for (const li of Array.from(list.children)) {
    if (li.localName !== "li") {
      continue;
    }
    const anchor = Array.from(li.children).find((c) => c.localName === "a");
    const label = anchor?.textContent?.trim() || "";
    const href = anchor?.getAttribute("href") || "";
    const childList = Array.from(li.children).find((c) => c.localName === "ol");
    if (!label && !childList) {
      continue;
    }
    entries.push({
      label,
      href,
      depth: 0,
      children: childList ? parseNavList(childList) : [],
    });
  }
  return entries;
}

function withDepth(entries: EpubTocEntry[], depth = 0): EpubTocEntry[] {
  return entries.map((entry) => ({
    ...entry,
    depth,
    children: withDepth(entry.children, depth + 1),
  }));
}

function parseNavToc(navDoc: Document): EpubTocEntry[] {
  const navs = allByLocalName(navDoc, "nav");
  const tocNav =
    navs.find((nav) => attrByLocalName(nav, "type") === "toc") || navs[0];
  const list = tocNav
    ? Array.from(tocNav.getElementsByTagName("*")).find(
        (el) => el.localName === "ol",
      )
    : null;
  return list ? withDepth(parseNavList(list)) : [];
}

function parseNcxToc(ncxDoc: Document): EpubTocEntry[] {
  const navMap = firstByLocalName(ncxDoc, "navMap");
  if (!navMap) {
    return [];
  }
  const walk = (parent: Element, depth: number): EpubTocEntry[] => {
    const navPoints = Array.from(parent.children).filter(
      (child) => child.localName === "navPoint",
    );
    return navPoints.map((point) => {
      const label = point
        .getElementsByTagNameNS("*", "text")[0]
        ?.textContent?.trim();
      const content = Array.from(point.children).find(
        (child) => child.localName === "content",
      );
      return {
        label: label || "",
        href: content?.getAttribute("src") || "",
        depth,
        children: walk(point, depth + 1),
      };
    });
  };
  return walk(navMap, 0);
}

function resolveTocHrefs(toc: EpubTocEntry[], baseDir: string): EpubTocEntry[] {
  return toc.map((entry) => {
    // Keep the fragment: the chapter maps to a spine item, the fragment is
    // what lets a nested TOC entry land on its section.
    const raw = entry.href || "";
    const hashIndex = raw.indexOf("#");
    const path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const fragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
    const resolvedPath = path
      ? resolveHref(baseDir, path)
      : resolveHref(baseDir, "./");
    return {
      ...entry,
      href: fragment ? `${resolvedPath}#${fragment}` : resolvedPath,
      children: resolveTocHrefs(entry.children, baseDir),
    };
  });
}

function findCover(
  doc: Document,
  manifest: EpubManifestItem[],
  opfDir: string,
): string | null {
  const byProperties = manifest.find((item) =>
    item.properties.includes("cover-image"),
  );
  if (byProperties) {
    return byProperties.href;
  }
  const metaById = allByLocalName(doc, "meta").find(
    (meta) => (meta.getAttribute("name") || "").toLowerCase() === "cover",
  );
  const coverId = metaById?.getAttribute("content") || "";
  const byId = manifest.find((item) => item.id === coverId);
  if (byId) {
    return byId.href;
  }
  const reference = allByLocalName(doc, "reference").find(
    (ref) => (ref.getAttribute("type") || "").toLowerCase() === "cover",
  );
  const href = reference?.getAttribute("href") || "";
  return href ? resolveHref(opfDir, href) : null;
}

/** Removes scripts and inline handlers from a parsed EPUB XHTML document. */
export function sanitizeEpubXhtml(doc: Document): Document {
  doc.querySelectorAll("script, iframe, object, embed").forEach((el) => {
    el.remove();
  });
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
      if (
        (name === "href" || name === "src") &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc;
}

function toFileMap(raw: Unzipped): Map<string, Uint8Array<ArrayBuffer>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, data] of Object.entries(raw)) {
    files.set(normalizeZipPath(name), data);
  }
  return files;
}

/** Parses an already-unzipped EPUB archive into the reader model. */
export function parseEpubFromFiles(raw: Unzipped): EpubBook {
  const files = toFileMap(raw);

  const opfPath = opfPathFromContainer(files);
  const opf = files.get(opfPath);
  if (!opf) {
    throw new Error(`不是有效的 EPUB：找不到 ${opfPath}`);
  }
  const opfDir = dirOf(opfPath);
  const doc = decodeXml(opf);
  if (doc.querySelector("parsererror")) {
    throw new Error("不是有效的 EPUB：OPF 解析失败");
  }

  const manifest = readManifest(doc, opfDir);
  const spine = readSpine(doc, manifest);

  const navItem = manifest.find((item) => item.properties.includes("nav"));
  let toc: EpubTocEntry[] = [];
  if (navItem) {
    const navBytes = files.get(navItem.href);
    if (navBytes) {
      toc = resolveTocHrefs(
        parseNavToc(decodeXml(navBytes)),
        dirOf(navItem.href),
      );
    }
  }
  if (!toc.length) {
    const ncx = manifest.find((item) => item.mediaType === NCX_MEDIA_TYPE);
    const ncxBytes = ncx ? files.get(ncx.href) : undefined;
    if (ncx && ncxBytes) {
      toc = resolveTocHrefs(parseNcxToc(decodeXml(ncxBytes)), dirOf(ncx.href));
    }
  }

  const metadata: EpubMetadata = {
    title: textOf(doc, "title") || "未命名 EPUB",
    author: textOf(doc, "creator"),
    language: textOf(doc, "language"),
    identifier: textOf(doc, "identifier"),
    publisher: textOf(doc, "publisher"),
    spineCount: spine.length,
  };

  return {
    opfPath,
    opfDir,
    metadata,
    manifest,
    spine,
    toc,
    coverPath: findCover(doc, manifest, opfDir),
    files,
  };
}

/** Parses an EPUB archive into the reader model (synchronous). */
export function parseEpub(bytes: ArrayBuffer): EpubBook {
  return parseEpubFromFiles(unzipSync(new Uint8Array(bytes)));
}

let unzipWorker: Worker | null = null;
let unzipRequestId = 0;

/**
 * Decompresses the archive in a web worker (keeping the UI responsive for large
 * books), then parses the result on the main thread. Prefer this over the
 * synchronous `parseEpub` for user-initiated opens.
 */
export async function parseEpubAsync(bytes: ArrayBuffer): Promise<EpubBook> {
  const raw = await unzipInWorker(bytes);
  return parseEpubFromFiles(raw);
}

function unzipInWorker(bytes: ArrayBuffer): Promise<Unzipped> {
  unzipWorker ??= new UnzipWorker();
  const worker = unzipWorker;
  const id = (unzipRequestId += 1);
  return new Promise((resolve, reject) => {
    const onMessage = (
      event: MessageEvent<
        | {
            id: number;
            ok: true;
            files: Array<[string, Uint8Array<ArrayBuffer>]>;
          }
        | { id: number; ok: false; error: string }
      >,
    ) => {
      if (event.data.id !== id) {
        return;
      }
      worker.removeEventListener("message", onMessage);
      if (event.data.ok) {
        const raw: Unzipped = {};
        for (const [name, data] of event.data.files) {
          raw[name] = data;
        }
        resolve(raw);
      } else {
        reject(new Error(event.data.error || "解压失败"));
      }
    };
    worker.addEventListener("message", onMessage);
    // Transfer the source buffer so it is not copied into the worker.
    worker.postMessage({ id, bytes }, [bytes]);
  });
}

/**
 * Minimal metadata read used to open an EPUB. Kept as a thin wrapper so callers
 * that only need the header do not deal with the full model.
 */
export function parseEpubMetadata(bytes: ArrayBuffer): EpubMetadata {
  return parseEpub(bytes).metadata;
}
