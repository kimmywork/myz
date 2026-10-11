import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";

export interface HighlightCounts {
  all: number;
  highlight: number;
  clip: number;
}

export interface HighlightGroup {
  pageNumber: number;
  records: MyZRecord[];
}

export function buildHighlightCounts(
  annotations: MyZRecord[],
): HighlightCounts {
  const counts: HighlightCounts = { all: 0, highlight: 0, clip: 0 };
  for (const record of annotations) {
    if (!record.pdfLocator) continue;
    counts.all += 1;
    if (record.kind === RECORD_KINDS.HIGHLIGHT) counts.highlight += 1;
    else if (record.kind === RECORD_KINDS.CLIP) counts.clip += 1;
  }
  return counts;
}

/** Records matching the kind filter and search query, grouped by page. */
export function buildHighlightGroups(
  annotations: MyZRecord[],
  filter: string,
  rawQuery: string,
): HighlightGroup[] {
  const query = rawQuery.trim().toLowerCase();
  const map = new Map<number, MyZRecord[]>();
  for (const record of annotations) {
    const locator = record.pdfLocator;
    if (!locator) continue;
    if (filter !== "all" && record.kind !== filter) continue;
    if (query) {
      const haystack = [record.text, record.note ?? "", ...(record.tags ?? [])]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    const list = map.get(locator.pageNumber) ?? [];
    list.push(record);
    map.set(locator.pageNumber, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, records]) => ({ pageNumber, records }));
}
