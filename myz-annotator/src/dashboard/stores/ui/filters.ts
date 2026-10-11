import type { MyZRecord } from "@myz/shared/types";

export interface SearchFilters {
  search: string;
  site: string;
  tags: string[];
  from: string;
  to: string;
}

/** Whether a record passes the active site/tag/date/full-text filters. */
export function matchesFilters(
  item: MyZRecord,
  filters: SearchFilters,
  needle: string,
): boolean {
  if (!item) return false;
  if (filters.site && item.hostname !== filters.site) return false;
  if (filters.tags.length) {
    const itemTags = new Set(item.tags || []);
    if (!filters.tags.every((tag) => itemTags.has(tag))) return false;
  }
  if (filters.from) {
    const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
    if (itemDate < filters.from) return false;
  }
  if (filters.to) {
    const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
    if (itemDate > filters.to) return false;
  }
  if (needle) {
    const haystack = [item.text, item.note, (item.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/**
 * Interpret a quick-search string into a filter patch: `site:` / `#tag` /
 * bare site / free text. Returns null when the query is empty.
 */
export function resolveQuickSearch(
  value: string,
  sites: string[],
  tags: string[],
): Partial<SearchFilters> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("site:")) {
    const candidate = trimmed.slice(5).trim();
    return candidate && sites.includes(candidate)
      ? { site: candidate }
      : { search: candidate || "" };
  }

  const normalizedTag = trimmed.startsWith("#")
    ? trimmed.slice(1).trim()
    : trimmed;
  if (normalizedTag && tags.includes(normalizedTag)) {
    return { tags: [normalizedTag] };
  }
  if (sites.includes(trimmed)) return { site: trimmed };
  return { search: trimmed.startsWith("#") ? normalizedTag : trimmed };
}
