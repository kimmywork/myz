import { resolveHref } from "./paths.js";
import type { EpubTocEntry } from "./types.js";
import { allByLocalName, attrByLocalName, firstByLocalName } from "./xml.js";

function parseNavList(list: Element): EpubTocEntry[] {
  const entries: EpubTocEntry[] = [];
  for (const li of Array.from(list.children)) {
    if (li.localName !== "li") continue;
    const anchor = Array.from(li.children).find((c) => c.localName === "a");
    const label = anchor?.textContent?.trim() || "";
    const href = anchor?.getAttribute("href") || "";
    const childList = Array.from(li.children).find((c) => c.localName === "ol");
    if (!label && !childList) continue;
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
  if (!navMap) return [];
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
    // what lets a nested TOC entry land at its section.
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

export { parseNavToc, parseNcxToc, resolveTocHrefs };
