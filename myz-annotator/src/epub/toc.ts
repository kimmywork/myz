import type { EpubTocEntry } from "./parse.js";

/** Href path from the root to the entry, or null when not found. */
export function findTocPath(
  entries: EpubTocEntry[],
  href: string,
  ancestors: string[] = [],
): string[] | null {
  for (const entry of entries) {
    const next = [...ancestors, entry.href];
    if (entry.href === href) {
      return next;
    }
    const found = findTocPath(entry.children, href, next);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Keeps entries that match the query or contain a matching descendant. */
export function filterToc(
  entries: EpubTocEntry[],
  query: string,
): EpubTocEntry[] {
  const result: EpubTocEntry[] = [];
  for (const entry of entries) {
    const children = filterToc(entry.children, query);
    const self = `${entry.label} ${entry.href}`.toLowerCase().includes(query);
    if (self || children.length) {
      result.push({ ...entry, children });
    }
  }
  return result;
}
