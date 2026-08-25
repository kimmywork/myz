import { describeHighlightStyle } from "@myz/shared/highlightUtils";
import { HIGHLIGHT_STYLES, MyZRecord } from "@myz/shared/types";
import { extractHostname } from "@myz/shared/url";

export function buildMarkdownExport(highlights: MyZRecord[]): string {
  if (!highlights.length) {
    return "# MyZ 智能助理 Export\n\n_No highlights available._";
  }
  const grouped = groupByDate(highlights);
  const lines = [];
  lines.push("# MyZ 智能助理 Export");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");

  for (const [date, items] of grouped) {
    lines.push(`## ${date}`);
    lines.push("");
    items.forEach((item) => {
      const tags =
        Array.isArray(item.tags) && item.tags.length
          ? ` #${item.tags.join(" #")}`
          : "";
      const domain = extractHostname(item.url);
      lines.push(
        `- **${escapeMarkdown(item.title || domain || "Untitled")}** (${date})${tags}`,
      );
      lines.push(
        `  - Page: [${escapeMarkdown(domain || item.url)}](${item.url})`,
      );
      const quoteMarkdown = htmlToMarkdown(item.html || "");
      if (quoteMarkdown) {
        lines.push("  - Quote:");
        quoteMarkdown.split("\n").forEach((line) => {
          lines.push(
            `    ${line.startsWith(">") ? line : `> ${line}`}`.trimEnd(),
          );
        });
      }
      if (item.note) {
        lines.push("  - Note:");
        item.note.split("\n").forEach((line) => {
          lines.push(`    ${escapeMarkdown(line)}`);
        });
      }
      if (item.color) {
        lines.push(`  - Color: ${item.color}`);
      }
      if (item.kind === "highlight") {
        lines.push(
          `  - Style: ${describeHighlightStyle(item.style ?? HIGHLIGHT_STYLES.WAVY)}`,
        );
      }
      lines.push("");
    });
  }

  return lines.join("\n");
}

function groupByDate(highlights: MyZRecord[]): Map<string, MyZRecord[]> {
  const map = new Map();
  highlights.forEach((item) => {
    const date = new Date(item.createdAt || Date.now())
      .toISOString()
      .split("T")[0];
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date).push(item);
  });
  return new Map([...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)));
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, (match) => `\\${match}`);
}

export function htmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }

  const source = decodeHtmlEntities(html);
  if (!source) {
    return "";
  }

  const fallback = fallbackHtmlToMarkdown(source);
  const normalized = normalizeMarkdown(fallback);
  if (normalized) {
    return normalized;
  }

  return cleanMultiline(stripHtmlTags(source));
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function fallbackHtmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }

  let output = html;
  const preservedPre: string[] = [];

  output = annotateHtmlLists(output);

  output = output.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (match, inner) => {
    const normalized = normalizePreBlock(inner);
    const token = `__MYZ_PRE_BLOCK_${preservedPre.length}__`;
    preservedPre.push(normalized);
    return token;
  });

  output = output.replace(/\s*<br\s*\/?>(\s*)/gi, "\n");
  output = output.replace(/<\/?p[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?div[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?blockquote[^>]*>/gi, (match) =>
    match.startsWith("</") ? "\n" : "\n> ",
  );
  output = output.replace(/<\/li>/gi, "");
  output = output.replace(/<\/?ul[^>]*>/gi, "\n");
  output = output.replace(/<ol[^>]*>/gi, "\n");
  output = output.replace(/<\/?ol[^>]*>/gi, "\n");
  output = output.replace(/<strong[^>]*>|<b[^>]*>/gi, "**");
  output = output.replace(/<\/strong>|<\/b>/gi, "**");
  output = output.replace(/<em[^>]*>|<i[^>]*>/gi, "*");
  output = output.replace(/<\/em>|<\/i>/gi, "*");
  output = output.replace(
    /<code\b[^>]*>([\s\S]*?)<\/code>/gi,
    (match, content) => `\`${decodeHtmlEntities(content)}\``,
  );
  output = output.replace(
    /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi,
    "[$2]($1)",
  );
  output = output.replace(/<mark[^>]*>(.*?)<\/mark>/gi, "==$1==");
  output = output.replace(
    /<h([1-6])[^>]*>(.*?)<\/h\1>/gi,
    (match, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`,
  );
  output = output.replace(
    /<table[^>]*>|<\/table>|<thead[^>]*>|<\/thead>|<tbody[^>]*>|<\/tbody>/gi,
    "\n",
  );
  output = output.replace(/<tr[^>]*>/gi, "\n");
  output = output.replace(/<\/tr>/gi, "\n");
  output = output.replace(/<t[dh][^>]*>/gi, " | ");
  output = output.replace(/<\/t[dh]>/gi, " ");
  output = output.replace(/<[^>]+>/g, "");
  output = decodeHtmlEntities(output);

  if (preservedPre.length) {
    preservedPre.forEach((block, index) => {
      const token = new RegExp(`__MYZ_PRE_BLOCK_${index}__`, "g");
      output = output.replace(token, `\n\n\`\`\`\n${block}\n\`\`\`\n\n`);
    });
  }

  return output;
}

function annotateHtmlLists(html: string): string {
  if (!html || typeof html !== "string") {
    return html || "";
  }
  const tagPattern = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  const stack = [];
  let result = "";
  let lastIndex = 0;

  while (true) {
    const match = tagPattern.exec(html);
    if (!match) {
      result += html.slice(lastIndex);
      break;
    }

    result += html.slice(lastIndex, match.index);
    const raw = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = raw.startsWith("</");

    if (!isClosing) {
      if (tagName === "ul" || tagName === "ol") {
        stack.push({ type: tagName, counter: 0 });
      } else if (tagName === "li") {
        if (!stack.length) {
          result += "\n- ";
        } else {
          const current = stack[stack.length - 1];
          const depth = Math.max(0, stack.length - 1);
          let marker = "-";
          if (current.type === "ol") {
            current.counter += 1;
            marker = `${current.counter}.`;
          }
          const indent = depth ? "  ".repeat(depth) : "";
          result += `\n${indent}${marker} `;
        }
      } else {
        result += raw;
      }
    } else {
      if ((tagName === "ul" || tagName === "ol") && stack.length) {
        stack.pop();
      } else if (tagName !== "li") {
        result += raw;
      }
    }

    lastIndex = tagPattern.lastIndex;
  }

  return result;
}

function trimBlankLines(lines: string[]): string[] {
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }
  return lines;
}

function normalizePreBlock(value: string): string {
  const decoded = decodeHtmlEntities(value || "")
    .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, "$1")
    .replace(/<br\s*\/\?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  if (!decoded) {
    return "";
  }
  const lines = trimBlankLines(decoded.replace(/\r\n?/g, "\n").split("\n"));
  return lines.map((line) => line.replace(/\s+$/g, "")).join("\n");
}

export function cleanMultiline(value: string): string {
  if (!value) {
    return "";
  }
  const lines = trimBlankLines(
    String(value)
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ") // eslint-disable-line no-control-regex
      .split("\n"),
  );

  const normalized = lines.map((line) =>
    line
      .replace(/\t/g, "  ")
      .replace(/[\v\f]/g, " ")
      .replace(/\s+$/g, ""),
  );

  return normalized.join("\n");
}

function decodeHtmlEntities(value: unknown): string {
  if (!value) {
    return "";
  }
  return String(value).replace(
    /&(#x?[0-9a-f]+|#\d+|[a-zA-Z]+);/g,
    (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith("#x")) {
        const code = parseInt(lower.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (lower.startsWith("#")) {
        const code = parseInt(lower.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      switch (lower) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
        case "lsquo":
        case "rsquo":
          return "'";
        case "nbsp":
          return " ";
        case "hellip":
          return "…";
        case "mdash":
          return "—";
        default:
          return match;
      }
    },
  );
}

function stripHtmlTags(value: unknown): string {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/<br\s*\/?>((\r?\n)?)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/?(ul|ol|table|thead|tbody|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}
