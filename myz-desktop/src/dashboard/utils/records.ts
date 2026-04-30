import {
  CONTENT_TYPES,
  MyZRecordSchema,
  isRecord,
  type MyZRecord,
  RECORD_KINDS,
  ensureRecordSchemaVersion,
  getRecordKind,
  resolveRecordContentType,
} from "@myz/shared";

function extractHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function renderMarkdown(text: string): string {
  if (!text) {
    return "";
  }

  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /\bhttps?:\/\/[^\s<]+/gi,
    (match) =>
      `<a href="${match}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline dark:text-indigo-300">${match}</a>`,
  );
  const withStrong = linked.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const withEm = withStrong.replace(/\*(.+?)\*/g, "<em>$1</em>");
  const withCode = withEm.replace(/`([^`]+)`/g, "<code>$1</code>");
  const paragraphs = withCode
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return paragraphs;
}

export type PageSortMode = "time" | "range";

export interface PageGroup {
  key: string;
  url: string;
  title: string;
  hostname: string;
  latestAt: string;
  count: number;
  records: MyZRecord[];
}

export function normalizeRecord(record?: unknown): MyZRecord | null {
  if (!isRecord(record)) {
    return null;
  }

  const recordWithKind: Partial<MyZRecord> = {
    ...(record as Partial<MyZRecord>),
    kind: getRecordKind(record as Partial<MyZRecord>),
  };
  const versioned = ensureRecordSchemaVersion(recordWithKind);
  versioned.contentType = resolveRecordContentType(versioned);

  const result = MyZRecordSchema.safeParse(versioned);
  if (result.success) {
    return result.data;
  }

  console.warn("Record validation failed", result.error);
  return null;
}

export function computeRecordStats(records: MyZRecord[] = []) {
  let highlightCount = 0;
  let savedCount = 0;
  let aiCount = 0;
  let tweetCount = 0;

  records.forEach((item) => {
    if (!item) {
      return;
    }
    const kind = getRecordKind(item);
    if (kind === RECORD_KINDS.CLIP || kind === RECORD_KINDS.BOOKMARK) {
      savedCount += 1;
      return;
    }
    if (kind === RECORD_KINDS.AI_GENERATED) {
      aiCount += 1;
      return;
    }
    if (String(kind).startsWith("tweet:") || String(kind).startsWith("toot:")) {
      tweetCount += 1;
      return;
    }
    highlightCount += 1;
  });

  return {
    total: highlightCount + savedCount + aiCount + tweetCount,
    highlightCount,
    savedCount,
    aiCount,
    tweetCount,
  };
}

export function groupRecordsByPage(records: MyZRecord[]): PageGroup[] {
  const map = new Map<string, PageGroup>();

  records.forEach((record) => {
    const url = record?.url || record?.sourceUrl;
    if (!url) {
      return;
    }

    const existing = map.get(url);
    const latest = Date.parse(record.createdAt || record.updatedAt || "") || 0;
    if (!existing) {
      map.set(url, {
        key: url,
        url,
        title: record.title || "",
        hostname:
          record.hostname ||
          (() => {
            try {
              return extractHostname(url);
            } catch {
              return "";
            }
          })(),
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
    if (!existing.title && record.title) {
      existing.title = record.title;
    }
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

function comparePathSegments(
  left: { name: string; index: number }[],
  right: { name: string; index: number }[],
): number {
  const len = Math.min(left.length, right.length);
  for (let index = 0; index < len; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    if (a.index !== b.index) {
      return a.index - b.index;
    }
  }
  return left.length - right.length;
}

function buildRangeKey(record: MyZRecord) {
  const start = record.range?.start || record.range?.end;
  if (!start || !Array.isArray(start.path) || !start.path.length) {
    return null;
  }

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
  if (!keyA && !keyB) {
    return 0;
  }
  if (!keyA) {
    return 1;
  }
  if (!keyB) {
    return -1;
  }

  const pathCompare = comparePathSegments(keyA.path, keyB.path);
  if (pathCompare !== 0) {
    return pathCompare;
  }
  return keyA.offset - keyB.offset;
}

export function sortRecordsForPage(
  records: MyZRecord[],
  mode: PageSortMode,
): MyZRecord[] {
  const sorted = records.slice();
  if (mode === "range") {
    sorted.sort((a, b) => {
      const rangeOrder = compareByRange(a, b);
      if (rangeOrder !== 0) {
        return rangeOrder;
      }
      const timeA = Date.parse(a.createdAt || a.updatedAt || "");
      const timeB = Date.parse(b.createdAt || b.updatedAt || "");
      return (
        (Number.isFinite(timeB) ? timeB : 0) -
        (Number.isFinite(timeA) ? timeA : 0)
      );
    });
    return sorted;
  }

  sorted.sort((a, b) => {
    const timeA = Date.parse(a.createdAt || a.updatedAt || "");
    const timeB = Date.parse(b.createdAt || b.updatedAt || "");
    return (
      (Number.isFinite(timeB) ? timeB : 0) -
      (Number.isFinite(timeA) ? timeA : 0)
    );
  });
  return sorted;
}

export function groupHighlightsByDate(highlights: MyZRecord[]) {
  const map = new Map<string, MyZRecord[]>();
  highlights.forEach((item) => {
    const date = item?.createdAt ? item.createdAt.slice(0, 10) : "未知日期";
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date)?.push(item);
  });
  return [...map.entries()].sort((a, b) =>
    a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1,
  );
}

export function formatDateTime(value: string) {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSearchTerms(input: string): string[] {
  if (!input) {
    return [];
  }

  const seen = new Set();
  const terms: string[] = [];
  input
    .split(/\s+/)
    .filter(Boolean)
    .forEach((term) => {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        terms.push(term);
      }
    });
  return terms;
}

export function applySearchHighlights(html: string, terms: string[]) {
  if (!terms.length || !html) {
    return html;
  }

  return terms.reduce((output, term) => {
    const pattern = escapeRegExp(term);
    if (!pattern) {
      return output;
    }
    const regex = new RegExp(`(${pattern})`, "gi");
    return output.replace(regex, '<mark class="search-hit">$1</mark>');
  }, html);
}

export function highlightTermsInHtml(html: string, terms: string[]): string {
  if (!html || !terms.length) {
    return html;
  }

  const pattern = terms
    .map((term) => escapeRegExp(term))
    .filter(Boolean)
    .join("|");
  if (!pattern) {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const targets: Node[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (
      current.parentNode &&
      (current.parentNode as Element).closest("mark.search-hit")
    ) {
      continue;
    }
    targets.push(current);
  }

  targets.forEach((node) => {
    const text = node.nodeValue ?? "";
    const nodeRegex = new RegExp(pattern, "gi");
    if (!nodeRegex.test(text)) {
      return;
    }

    nodeRegex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(text))) {
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    node.parentNode?.replaceChild(fragment, node);
  });

  return container.innerHTML;
}

export function renderHighlightContent(
  record: MyZRecord,
  terms: string[],
): string {
  const contentType = resolveRecordContentType(record);
  if (contentType === CONTENT_TYPES.MARKDOWN) {
    const rendered = renderMarkdown(record?.text || "");
    return highlightTermsInHtml(rendered, terms);
  }

  if (contentType === CONTENT_TYPES.HTML && record?.html) {
    return highlightTermsInHtml(record.html, terms);
  }

  const escaped = escapeHtml(record?.text || "");
  const withBreaks = escaped.replace(/\r?\n/g, "<br>");
  return applySearchHighlights(withBreaks, terms);
}

export function formatNote(value: string, terms: string[]): string {
  if (!value) {
    return "";
  }
  const rendered = renderMarkdown(String(value));
  return highlightTermsInHtml(rendered, terms);
}

export function formatInline(value: string, terms: string[]): string {
  if (!value) {
    return "";
  }
  return applySearchHighlights(escapeHtml(String(value)), terms);
}

export function recordToMarkdown(record: MyZRecord): string {
  const tags =
    Array.isArray(record?.tags) && record.tags.length
      ? ` #${record.tags.join(" #")}`
      : "";
  const quote = (record?.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const note = record?.note ? `\n\n${record.note}` : "";
  const link = record?.sourceUrl || record?.url || "";
  const title = record?.title || record?.hostname || "页面";
  return `- **${title}**${tags} ([链接](${link}))\n${quote}${note}`;
}
