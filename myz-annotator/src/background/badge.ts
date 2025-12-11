function coerceBadgeCount(value?: number): number {
  if (typeof value !== "number") {
    return 0;
  }
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export interface BadgeCount {
  highlightCount: number;
  savedCount: number;
  total: number;
}

export interface LegacyBadgeCount {
  count: number;
}

export function normalizeBadgeCounts(payload: Partial<BadgeCount & LegacyBadgeCount> = {}): BadgeCount {
  const highlightFromPayload = coerceBadgeCount(payload.highlightCount);
  const savedFromPayload = coerceBadgeCount(payload.savedCount);
  const totalFromPayload = coerceBadgeCount(payload.total);
  const legacyCount = coerceBadgeCount(payload.count);

  const highlightCount = Math.max(highlightFromPayload, legacyCount);
  const savedCount = savedFromPayload;

  let total = totalFromPayload;
  if (total === 0) {
    total = highlightCount + savedCount;
  }

  return {
    highlightCount,
    savedCount,
    total,
  };
}

export function buildActionTitle({ total, highlightCount, savedCount }: BadgeCount): string {
  const base = "MyZ Annotator";
  if (!total) {
    return `${base} · 暂无条目`;
  }
  const detailParts = [];
  if (highlightCount) {
    detailParts.push(`高亮 ${highlightCount}`);
  }
  if (savedCount) {
    detailParts.push(`保存 ${savedCount}`);
  }
  const detail = detailParts.length ? `（${detailParts.join(" · ")}）` : "";
  return `${base} · 共 ${total} 条${detail}`;
}
