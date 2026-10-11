/** Minimal RFC-4180-ish CSV splitter (quotes, escaped quotes, CRLF). */
export function parseCsvRows(text: string): string[][] {
  if (!text) return [];
  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.charCodeAt(0) === 0xfeff) normalized = normalized.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  rows.push(row);

  while (
    rows.length &&
    rows[rows.length - 1].length === 1 &&
    !rows[rows.length - 1][0].trim()
  ) {
    rows.pop();
  }

  return rows;
}

/** Accepts epoch seconds/millis or a parseable date string. */
export function normalizeTimestamp(value: string, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = trimmed.length <= 10 ? numeric * 1000 : numeric;
      return new Date(ms).toISOString();
    }
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}
