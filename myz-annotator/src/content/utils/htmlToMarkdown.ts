import Defuddle from "defuddle/full";
import DOMPurify from "dompurify";

function wrapHtmlDocument(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Selection</title></head><body><div class="content">${html}</div></body></html>`;
}

export function htmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }

  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "sup",
      "sub",
      "del",
      "s",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
  });

  if (!cleaned) {
    return "";
  }

  try {
    const documentHtml = wrapHtmlDocument(cleaned);
    const parser = new DOMParser();
    const doc = parser.parseFromString(documentHtml, "text/html");
    const defuddle = new Defuddle(doc, { markdown: true });
    const result = defuddle.parse();
    const markdown = result.contentMarkdown || result.content || "";
    if (markdown.trim()) {
      return markdown.trim();
    }
    return cleaned;
  } catch (error) {
    console.error("htmlToMarkdown failed", error);
    return cleaned;
  }
}
