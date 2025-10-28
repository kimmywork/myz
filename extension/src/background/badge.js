function coerceBadgeCount(value) {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function normalizeBadgeCounts(payload = {}) {
  const highlightFromPayload = coerceBadgeCount(payload.highlightCount);
  const savedFromPayload = coerceBadgeCount(payload.savedCount);
  const totalFromPayload = coerceBadgeCount(payload.total);
  const legacyCount = coerceBadgeCount(payload.count);

  const highlightCount = highlightFromPayload ?? (legacyCount !== null ? legacyCount : 0);
  const savedCount = savedFromPayload ?? 0;

  let total = totalFromPayload;
  if (total === null) {
    if (highlightFromPayload !== null || savedFromPayload !== null) {
      total = (highlightFromPayload ?? 0) + (savedFromPayload ?? 0);
    } else if (legacyCount !== null) {
      total = legacyCount;
    } else {
      total = 0;
    }
  }

  return {
    highlightCount: Math.max(0, highlightCount ?? 0),
    savedCount: Math.max(0, savedCount ?? 0),
    total: Math.max(0, total ?? 0)
  };
}

export function buildActionTitle({ total, highlightCount, savedCount }) {
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
