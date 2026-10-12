/**
 * Content-script entry point for the shared DOM sanitizer. The implementation
 * lives in `@myz/shared/sanitizeHtml` so the dashboard can reuse it for
 * imported records.
 */
export { sanitizeNode, sanitizeHtmlString } from "@myz/shared/sanitizeHtml";
