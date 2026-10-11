import type { MyZRecord } from "@myz/shared/types";
import {
  computeRecordStats,
  groupHighlightsByDate,
} from "@/dashboard/utils/records.js";

interface GroupedHighlights {
  date: string;
  items: MyZRecord[];
  stats: { total: number; highlightCount: number; savedCount: number };
  detailText: string;
}

function detailTextFor(stats: {
  highlightCount: number;
  savedCount: number;
}): string {
  const detail: string[] = [];
  if (stats.highlightCount) detail.push(`划线 ${stats.highlightCount}`);
  if (stats.savedCount) detail.push(`摘录 ${stats.savedCount}`);
  return detail.length ? `（${detail.join(" · ")}）` : "";
}

/** Group visible records by page (when filtered) or by date. */
export function buildGroupedHighlights(
  visible: MyZRecord[],
  pageFilter: string,
): GroupedHighlights[] {
  if (pageFilter) {
    const stats = computeRecordStats(visible);
    return [
      {
        date: "当前页面",
        items: visible,
        stats,
        detailText: detailTextFor(stats),
      },
    ];
  }
  return groupHighlightsByDate(visible).map(([date, items]) => {
    const stats = computeRecordStats(items);
    return { date, items, stats, detailText: detailTextFor(stats) };
  });
}

export function buildSummaryText(filtered: MyZRecord[]): string {
  const stats = computeRecordStats(filtered);
  const sites = new Set(filtered.map((item) => item.hostname).filter(Boolean));
  const detail = detailTextFor(stats);
  return `共 ${stats.total} 条记录${detail} · 涉及 ${sites.size} 个站点`;
}
