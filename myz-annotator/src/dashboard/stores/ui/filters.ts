import type { MyZRecord } from "@myz/shared/types";
import { localDateKey } from "@/dashboard/utils/records.js";

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
  // Date inputs are local dates; compare against the local date, not the UTC
  // slice of the ISO string (BUG2).
  const itemDate = localDateKey(item.createdAt);
  if (filters.from && itemDate < filters.from) return false;
  if (filters.to && itemDate > filters.to) return false;
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
