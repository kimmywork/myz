export const RECORD_KINDS = {
  HIGHLIGHT: "highlight",
  CLIP: "clip",
};

export function getRecordKind(record) {
  if (record && record.kind === RECORD_KINDS.CLIP) {
    return RECORD_KINDS.CLIP;
  }
  return RECORD_KINDS.HIGHLIGHT;
}

export function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return { ...record, kind: getRecordKind(record) };
}

export function computeRecordStats(records = []) {
  let highlightCount = 0;
  let savedCount = 0;
  records.forEach((item) => {
    if (!item) {
      return;
    }
    if (getRecordKind(item) === RECORD_KINDS.CLIP) {
      savedCount += 1;
    } else {
      highlightCount += 1;
    }
  });
  return {
    total: highlightCount + savedCount,
    highlightCount,
    savedCount,
  };
}

export function groupHighlightsByDate(highlights) {
  const map = new Map();
  highlights.forEach((item) => {
    const date = item?.createdAt ? item.createdAt.slice(0, 10) : "未知日期";
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date).push(item);
  });
  return [...map.entries()].sort((a, b) =>
    a[0] === b[0] ? 0 : a[0] < b[0] ? 1 : -1,
  );
}

export function formatDateTime(value) {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSearchTerms(input) {
  if (!input) {
    return [];
  }
  const seen = new Set();
  const terms = [];
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

export function applySearchHighlights(html, terms) {
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

export function highlightTermsInHtml(html, terms) {
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
  const targets = [];
  let current;
  while ((current = walker.nextNode())) {
    if (current.parentNode && current.parentNode.closest("mark.search-hit")) {
      continue;
    }
    targets.push(current);
  }
  targets.forEach((node) => {
    const text = node.nodeValue;
    const nodeRegex = new RegExp(pattern, "gi");
    if (!nodeRegex.test(text)) {
      return;
    }
    nodeRegex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
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

export function renderHighlightContent(record, terms) {
  if (record?.html) {
    return highlightTermsInHtml(record.html, terms);
  }
  const escaped = escapeHtml(record?.text || "");
  const withBreaks = escaped.replace(/\r?\n/g, "<br>");
  return applySearchHighlights(withBreaks, terms);
}

export function formatNote(value, terms) {
  if (!value) {
    return "";
  }
  const escaped = escapeHtml(String(value));
  const withBreaks = escaped.replace(/\r?\n/g, "<br>");
  return applySearchHighlights(withBreaks, terms);
}

export function formatInline(value, terms) {
  if (!value) {
    return "";
  }
  return applySearchHighlights(escapeHtml(String(value)), terms);
}

export function parseTags(value) {
  if (!value) {
    return [];
  }
  return value
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag));
}

export function recordToMarkdown(record) {
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
