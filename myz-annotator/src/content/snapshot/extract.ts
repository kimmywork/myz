/**
 * Turning a live page into a snapshot (§I8).
 *
 * The body is the article around the record, not the whole document: extending
 * from the record to both sides reaches the content container's edges, which is
 * what I9's truncation thresholds will refine later. What ships here is the
 * structure only — no scripts, no image payloads, no site CSS.
 *
 * The extractor is written as pure functions over a `Document` so it can be
 * tested against fixtures without a running content script.
 */
import { ZEN_SELECTOR_MAP } from "../zen-config.js";
import { SNAPSHOT_CSS } from "./style.js";
import { childContaining, truncateAround } from "./truncate.js";

/** Elements whose contents are never part of the readable body. */
const DROP_SELECTORS = [
  "script",
  "style",
  "link",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "img",
  "picture",
  "video",
  "audio",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "aside",
  "footer",
  "header",
  "[role='navigation']",
  "[role='banner']",
  "[role='complementary']",
  "[aria-hidden='true']",
].join(",");

/** Class/id noise that never helps a static render. */
const NOISE_ATTRIBUTES = ["class", "id", "style", "contenteditable"];

export interface ExtractedSnapshot {
  html: string;
  css: string;
  title: string;
  url: string;
  /** Bytes of `html + css` as UTF-8. */
  bytes: number;
}

/** Text-per-node score: the readable-body heuristic used across the app. */
function textDensityScore(element: Element): number {
  const text = (element.textContent || "").trim().length;
  if (!text) return 0;
  return text / Math.max(1, element.querySelectorAll("*").length);
}

/** The site's configured article container, when a rule matches. */
function elementFromSiteRules(doc: Document, url: string): Element | null {
  for (const rule of ZEN_SELECTOR_MAP) {
    const matches =
      typeof rule.pattern === "string"
        ? url.includes(rule.pattern)
        : rule.pattern.test(url);
    if (!matches) continue;
    const found = doc.querySelector(rule.selector);
    if (found) return found;
  }
  return null;
}

/** Best readable container: site rule, then semantic tags, then density. */
export function findSnapshotRoot(doc: Document, url: string): Element {
  const bySite = elementFromSiteRules(doc, url);
  if (bySite) return bySite;

  for (const selector of ["article", "main", "[role='main']"]) {
    const found = doc.querySelector(selector);
    if (found && (found.textContent || "").trim().length > 200) return found;
  }

  const candidates = Array.from(
    doc.querySelectorAll("article, main, section, div"),
  ).filter((element) => (element.textContent || "").trim().length > 400);
  if (!candidates.length) return doc.body;
  return candidates.sort(
    (a, b) => textDensityScore(b) - textDensityScore(a),
  )[0];
}

/** True when the element still has something worth rendering. */
function hasContent(element: Element): boolean {
  if ((element.textContent || "").trim()) return true;
  // An empty block that is a deliberate separator still matters.
  return ["HR", "BR", "TD", "TH"].includes(element.tagName);
}

/** Strips noise attributes from the whole subtree. */
function cleanAttributes(root: Element): void {
  root.removeAttribute("class");
  root.removeAttribute("id");
  root.removeAttribute("style");
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of [
      ...NOISE_ATTRIBUTES,
      ...Array.from(element.attributes)
        .map((entry) => entry.name)
        .filter(
          (name) =>
            name.startsWith("data-") ||
            name.startsWith("aria-") ||
            name.startsWith("on"),
        ),
    ]) {
      element.removeAttribute(attribute);
    }
  }
}

/** Byte length of a string as UTF-8, matching what IndexedDB stores. */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Builds the snapshot body from `root`.
 *
 * @param root Content container (see {@link findSnapshotRoot}).
 * @param doc Owner document, for the title.
 * @param url Page URL.
 */
export function buildSnapshotBody(
  root: Element,
  doc: Document,
  url: string,
  anchor: Node | null = null,
): ExtractedSnapshot {
  const clone = truncateAround(root, anchor);
  clone.querySelectorAll(DROP_SELECTORS).forEach((node) => node.remove());
  cleanAttributes(clone);

  // Drop wrappers that carry no text or separator after cleaning, bottom-up.
  const all = Array.from(clone.querySelectorAll("*")).reverse();
  for (const element of all) {
    if (!hasContent(element)) element.remove();
  }

  // A cleaned body can still serialise to `<article></article>`; that is an
  // empty snapshot, and storing it would let the UI say "已保存整页快照" over
  // nothing readable.
  const html = (clone.textContent || "").trim() ? clone.outerHTML : "";
  return {
    html,
    css: SNAPSHOT_CSS,
    title: (doc.title || "").trim(),
    url,
    bytes: byteLength(html) + byteLength(SNAPSHOT_CSS),
  };
}

/**
 * Convenience: the whole extraction for a live page.
 *
 * @param anchorText The record's text, when the capture started from one. The
 *   body is then windows around that anchor instead of the whole container
 *   (§I9); without it the full container is kept.
 */
export function extractSnapshot(
  doc: Document,
  url: string,
  anchorText?: string,
): ExtractedSnapshot {
  const root = findSnapshotRoot(doc, url);
  // `isConnected` is false for a document parsed off the live tree (tests,
  // fixtures), so containment is the reliable check here.
  const anchor = doc.contains(root) ? anchorElement(root, anchorText) : null;
  return buildSnapshotBody(root, doc, url, anchor);
}

/** The container child holding the record's text, when it can be found. */
function anchorElement(root: Element, anchorText?: string): Node | null {
  const owner = root.ownerDocument;
  if (!owner) return null;
  const container = containerAround(owner, anchorText);
  if (!container || !root.contains(container)) return null;
  return childContaining(root, container);
}

/**
 * The block-level container that holds a record's anchor, so the snapshot can
 * start from the record rather than from the first paragraph.
 *
 * Returns `null` when the anchor cannot be resolved, and the caller falls back
 * to the whole content root.
 */
/** Block-level elements an anchor can land in. */
const ANCHOR_BLOCKS =
  "p, li, blockquote, pre, td, th, dd, dt, figure, h1, h2, h3, h4, h5, h6, section, div";

/** Collapses whitespace so comparisons ignore the page's own line breaks. */
export function normalizeSnapshotText(
  value: string | null | undefined,
): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * The block that holds the record's text, or `null`.
 *
 * Compares the *block's* whole text, not individual text nodes: a quote that
 * spans inline markup (`alpha <em>beta</em> gamma`) lives in three text nodes
 * and would never match node-by-node. Among the blocks containing the quote,
 * the innermost wins, so a wrapping `div` does not swallow the capture.
 */
export function containerAround(
  doc: Document,
  anchorText: string | undefined,
): Element | null {
  const text = normalizeSnapshotText(anchorText);
  if (text.length < 4) return null;
  const needle = text.slice(0, 120);

  const matches = Array.from(doc.querySelectorAll(ANCHOR_BLOCKS)).filter(
    (element) => normalizeSnapshotText(element.textContent).includes(needle),
  );
  if (!matches.length) return null;
  // Drop ancestors of another match: the deepest one is the paragraph itself.
  const deepest = matches.filter(
    (element) =>
      !matches.some((other) => other !== element && element.contains(other)),
  );
  return deepest[0] ?? matches[matches.length - 1];
}
