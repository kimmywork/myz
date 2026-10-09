/**
 * Public barrel for content-script highlight state. Implementation is split
 * across `content/highlight/*` (cache, apply, reapply, indicators, restore,
 * actions); importers keep using this module.
 */
export {
  isInHighlightCache,
  storeRecord,
  getFromHighlightCache,
  getHighlightCache,
  deleteUnreachableHighlights,
  buildHighlightStateSnapshot,
} from "./highlight/cache.js";
export { applyHighlight, rebuildHighlightRange } from "./highlight/apply.js";
export {
  markHighlightForReapply,
  removeHighlightFromPending,
} from "./highlight/reapply.js";
export { updateHighlightIndicators } from "./highlight/indicators.js";
export { restoreHighlights } from "./highlight/restore.js";
export {
  updateExistingHighlight,
  deleteHighlight,
  focusHighlight,
} from "./highlight/actions.js";
