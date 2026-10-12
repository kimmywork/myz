/**
 * Public barrel for record display utilities. Implementation is split across
 * `records/{types,grouping,sorting,text,render,export}.ts`.
 */
export { normalizeRecord } from "@myz/shared/types";
export type { PageSortMode, PageGroup } from "./records/types.js";
export {
  getRecordKindLabel,
  computeRecordStats,
  groupRecordsByPage,
  groupHighlightsByDate,
  localDateKey,
} from "./records/grouping.js";
export { sortRecordsForPage } from "./records/sorting.js";
export {
  formatDateTime,
  escapeHtml,
  escapeRegExp,
  getSearchTerms,
  applySearchHighlights,
  highlightTermsInHtml,
} from "./records/text.js";
export {
  renderHighlightContent,
  formatNote,
  formatInline,
} from "./records/render.js";
export { parseTags, recordToMarkdown } from "./records/export.js";
