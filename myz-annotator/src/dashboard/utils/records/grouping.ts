import {
  getRecordKindLabel,
  hostnameForRecord,
  localDateKey,
} from "@myz/shared/recordDisplay";
import { RECORD_KINDS, getRecordKind, type MyZRecord } from "@myz/shared/types";
import type { PageGroup } from "./types.js";

// Re-export the canonical label so the barrel keeps the same export surface.
export { getRecordKindLabel };

export function computeRecordStats(records: MyZRecord[] = []) {
  let highlightCount = 0;
  let savedCount = 0;
  records.forEach((item) => {
    if (!item) return;
    const kind = getRecordKind(item);
    if (kind === RECORD_KINDS.CLIP || kind === RECORD_KINDS.BOOKMARK) {
      savedCount += 1;
      return;
    }
    highlightCount += 1;
  });
  return { total: highlightCount + savedCount, highlightCount, savedCount };
}

/**
 * Parse an ISO timestamp into milliseconds, or `null` when missing/invalid so
 * invalid dates never silently bucket into 1970 (BUG3).
 */
function toTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

// `localDateKey` lives in `@myz/shared/recordDisplay` so the snapshot header
// uses the same rule instead of formatting dates a second way.
export { localDateKey };

export function groupRecordsByPage(records: MyZRecord[]): PageGroup[] {
  const map = new Map<string, PageGroup>();

  records.forEach((record) => {
    const url = record?.url || record?.sourceUrl;
    if (!url) return;
    const existing = map.get(url);
    const latest = toTimestamp(record.createdAt || record.updatedAt);
    if (!existing) {
      map.set(url, {
        key: url,
        url,
        title: record.title || "",
        hostname: hostnameForRecord(record),
        latestAt:
          latest !== null
            ? new Date(latest).toISOString()
            : record.createdAt || record.updatedAt || "",
        count: 1,
        records: [record],
      });
      return;
    }
    existing.records.push(record);
    existing.count += 1;
    if (!existing.title && record.title) existing.title = record.title;
    if (!existing.hostname && record.hostname) {
      existing.hostname = record.hostname;
    }
    const existingLatest = toTimestamp(existing.latestAt);
    if (
      latest !== null &&
      (existingLatest === null || latest > existingLatest)
    ) {
      existing.latestAt = new Date(latest).toISOString();
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeA = toTimestamp(a.latestAt) ?? 0;
    const timeB = toTimestamp(b.latestAt) ?? 0;
    return timeB - timeA;
  });
}

export function groupHighlightsByDate(highlights: MyZRecord[]) {
  const map = new Map<string, MyZRecord[]>();
  highlights.forEach((item) => {
    const date = localDateKey(item?.createdAt) || "未知日期";
    if (!map.has(date)) map.set(date, []);
    map.get(date)?.push(item);
  });
  return [...map.entries()].sort((a, b) =>
    a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1,
  );
}
