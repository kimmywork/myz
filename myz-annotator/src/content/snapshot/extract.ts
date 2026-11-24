/**
 * Turning a live page into a snapshot (§I8 / §3.4, revised 2026-11-23).
 *
 * What ships here is *structure* — no scripts, no image payloads, no site CSS.
 * How much structure depends on the page (see `page-eligibility.ts`):
 *
 * - `full` — an article page keeps its **whole readable body** (正文边界内
 *   整篇). The viewer folds the display down to the annotated regions.
 * - `windowed` — an endless-scroll page gets a record-anchored window: the
 *   cluster of the page's records plus a little air (`truncate.ts`).
 *
 * The extractor is written as pure functions over a `Document` so it can be
 * tested against fixtures without a running content script.
 */
import { ZEN_SELECTOR_MAP } from "../zen-config.js";
import { SNAPSHOT_CSS } from "./style.js";
import { hitsRecord, normalizeWindowText, spanAround } from "./truncate.js";

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
 * @param root Content container (see {@link findSnapshotRoot}), already
 *   expanded to cover every record's block (see {@link rootCoveringRecords}).
 * @param doc Owner document, for the title.
 * @param url Page URL.
 * @param needles Normalized record texts: the span is built around them, and
 *   a container carrying one is never dropped as chrome.
 */
export function buildSnapshotBody(
  root: Element,
  doc: Document,
  url: string,
  needles: readonly string[] = [],
): ExtractedSnapshot {
  const clone = spanAround(root, needles);
  clone.querySelectorAll(DROP_SELECTORS).forEach((node) => {
    // 一条划线永远优先于去噪：高亮内容所在的容器不能被丢掉
    // （2026-11-24：Zalando 的标题/引言住在 article 自己的 <header> 里，
    // 被这条去噪整块删掉——高亮因此没进快照）。
    if (needles.length && hitsRecord(node, needles)) return;
    node.remove();
  });
  cleanAttributes(clone);

  // Drop wrappers that carry no text or separator after cleaning, bottom-up.
  const all = Array.from(clone.querySelectorAll("*")).reverse();
  for (const element of all) {
    if (!hasContent(element)) element.remove();
  }

  // A cleaned body can still serialise to `<article></article>`; that is an
  // empty snapshot, and storing it would let the UI say "已保存快照" over
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

/** Normalized, truncated needles: the window's record-hit comparison. */
export function recordNeedles(
  texts: readonly (string | undefined)[],
): string[] {
  const needles = new Set<string>();
  for (const text of texts) {
    const needle = normalizeWindowText(text).slice(0, 120);
    if (needle.length >= 4) needles.add(needle);
  }
  return [...needles];
}

/**
 * Convenience: the whole extraction for a live page.
 *
 * The snapshot is the page's span around its records (see `truncate.ts`),
 * taken within the readable root — expanded, when needed, to reach a record
 * that lives outside it.
 *
 * @param options `anchorText` + `recordTexts` are this page's highlight
 *   texts; the span is built around their blocks.
 */
export function extractSnapshot(
  doc: Document,
  url: string,
  options: {
    anchorText?: string;
    recordTexts?: readonly (string | undefined)[];
  } = {},
): ExtractedSnapshot {
  const needles = recordNeedles([
    options.anchorText,
    ...(options.recordTexts ?? []),
  ]);
  const root = needles.length
    ? rootCoveringRecords(doc, findSnapshotRoot(doc, url), needles)
    : findSnapshotRoot(doc, url);
  return buildSnapshotBody(root, doc, url, needles);
}

/** Closest shared ancestor of two elements, or `null`. */
function commonAncestor(a: Element, b: Element): Element | null {
  const chain = new Set<Element>();
  for (let node: Element | null = a; node; node = node.parentElement) {
    chain.add(node);
  }
  for (let node: Element | null = b; node; node = node.parentElement) {
    if (chain.has(node)) return node;
  }
  return null;
}

/**
 * Expands the capture root when a record lives outside it — a highlight must
 * never be silently missing from its page's snapshot (2026-11-24, the Zalando
 * post whose title sits in a `<header>` beside the `<article>`).
 *
 * The expansion is guarded: a common ancestor of `body` would drag in the
 * whole site chrome, so that case keeps the base root (the needle-based drop
 * protection below still applies within it).
 */
function rootCoveringRecords(
  doc: Document,
  base: Element,
  needles: readonly string[],
): Element {
  let root = base;
  for (const needle of needles) {
    const container = containerAround(doc, needle);
    if (!container || root.contains(container)) continue;
    const common = commonAncestor(root, container);
    if (
      !common ||
      common === doc.body ||
      common === doc.documentElement ||
      !common.contains(root)
    ) {
      continue;
    }
    root = common;
  }
  return root;
}

/** The container child holding the record's text, when it can be found. */
/**
 * The block-level container that holds a record's anchor.
 *
 * Compares the *block's* whole text, not individual text nodes: a quote that
 * spans inline markup (`alpha <em>beta</em> gamma`) lives in three text nodes
 * and would never match node-by-node. Among the blocks containing the quote,
 * the innermost wins, so a wrapping `div` does not swallow the capture.
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
