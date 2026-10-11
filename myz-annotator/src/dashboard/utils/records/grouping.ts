import { RECORD_KINDS, getRecordKind, type MyZRecord } from "@myz/shared/types";
import { extractHostname } from "@myz/shared/url";
import type { PageGroup } from "./types.js";

export function getRecordKindLabel(record: MyZRecord) {
  const kind = getRecordKind(record);
  switch (kind) {
    case RECORD_KINDS.HIGHLIGHT:
      return "划线";
    case RECORD_KINDS.CLIP:
      return "摘录";
    case RECORD_KINDS.BOOKMARK:
      return "来源";
    default:
      return "划线";
  }
}

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

function hostnameFor(url: string, record: MyZRecord): string {
  if (record.hostname) return record.hostname;
  try {
    return extractHostname(url);
  } catch {
    return "";
  }
}

export function groupRecordsByPage(records: MyZRecord[]): PageGroup[] {
  const map = new Map<string, PageGroup>();

  records.forEach((record) => {
    const url = record?.url || record?.sourceUrl;
    if (!url) return;
    const existing = map.get(url);
    const latest = Date.parse(record.createdAt || record.updatedAt || "") || 0;
    if (!existing) {
      map.set(url, {
        key: url,
        url,
        title: record.title || "",
        hostname: hostnameFor(url, record),
        latestAt: Number.isFinite(latest)
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
    const existingLatest = Date.parse(existing.latestAt || "") || 0;
    if (latest > existingLatest) {
      existing.latestAt = new Date(latest).toISOString();
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeA = Date.parse(a.latestAt || "");
    const timeB = Date.parse(b.latestAt || "");
    return (
      (Number.isFinite(timeB) ? timeB : 0) -
      (Number.isFinite(timeA) ? timeA : 0)
    );
  });
}

export function groupHighlightsByDate(highlights: MyZRecord[]) {
  const map = new Map<string, MyZRecord[]>();
  highlights.forEach((item) => {
    const date = item?.createdAt ? item.createdAt.slice(0, 10) : "未知日期";
    if (!map.has(date)) map.set(date, []);
    map.get(date)?.push(item);
  });
  return [...map.entries()].sort((a, b) =>
    a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1,
  );
}
