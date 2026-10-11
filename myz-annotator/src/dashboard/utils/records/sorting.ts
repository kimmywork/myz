import type { MyZRecord } from "@myz/shared/types";
import type { PageSortMode } from "./types.js";

function comparePathSegments(
  left: { name: string; index: number }[],
  right: { name: string; index: number }[],
): number {
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    if (a.index !== b.index) return a.index - b.index;
  }
  return left.length - right.length;
}

function buildRangeKey(record: MyZRecord) {
  const start = record.range?.start || record.range?.end;
  if (!start || !Array.isArray(start.path) || !start.path.length) return null;
  return {
    path: start.path,
    offset:
      typeof start.charOffset === "number"
        ? start.charOffset
        : typeof start.offset === "number"
          ? start.offset
          : 0,
  };
}

function compareByRange(a: MyZRecord, b: MyZRecord): number {
  const keyA = buildRangeKey(a);
  const keyB = buildRangeKey(b);
  if (!keyA && !keyB) return 0;
  if (!keyA) return 1;
  if (!keyB) return -1;
  const pathCompare = comparePathSegments(keyA.path, keyB.path);
  if (pathCompare !== 0) return pathCompare;
  return keyA.offset - keyB.offset;
}

function compareByTimeDesc(a: MyZRecord, b: MyZRecord): number {
  const timeA = Date.parse(a.createdAt || a.updatedAt || "");
  const timeB = Date.parse(b.createdAt || b.updatedAt || "");
  return (
    (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0)
  );
}

export function sortRecordsForPage(
  records: MyZRecord[],
  mode: PageSortMode,
): MyZRecord[] {
  const sorted = records.slice();
  if (mode === "range") {
    sorted.sort((a, b) => {
      const rangeOrder = compareByRange(a, b);
      if (rangeOrder !== 0) return rangeOrder;
      return compareByTimeDesc(a, b);
    });
    return sorted;
  }
  sorted.sort(compareByTimeDesc);
  return sorted;
}
