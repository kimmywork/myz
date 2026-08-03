import DOMPurify from "dompurify";
import { Defuddle } from "defuddle/node";

function wrapHtmlDocument(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Selection</title></head><body><div class="content">${html}</div></body></html>`;
}

export async function htmlToMarkdown(html: string): Promise<string> {
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
    const result = await Defuddle(documentHtml, undefined, { markdown: true });
    const markdown = (result as { content?: string }).content || "";
    if (markdown.trim()) {
      return markdown.trim();
    }
    return cleaned;
  } catch (error) {
    console.error("htmlToMarkdown failed", error);
    return cleaned;
  }
}
