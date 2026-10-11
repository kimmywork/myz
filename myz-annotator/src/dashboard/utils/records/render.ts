import { renderMarkdown } from "@myz/shared/markdownRenderer";
import {
  CONTENT_TYPES,
  resolveRecordContentType,
  type MyZRecord,
} from "@myz/shared/types";
import {
  applySearchHighlights,
  escapeHtml,
  highlightTermsInHtml,
} from "./text.js";

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
  if (!value) return "";
  const rendered = renderMarkdown(String(value));
  return highlightTermsInHtml(rendered, terms);
}

export function formatInline(value: string, terms: string[]): string {
  if (!value) return "";
  return applySearchHighlights(escapeHtml(String(value)), terms);
}
