/**
 * Public barrel for content-script highlight state. Implementation is split
 * across `content/highlight/*` (cache, apply, reapply, indicators, restore,
 * actions); importers keep using this module.
 *
 * FIXME(modal/inspector): the inspector store
 * (`content/stores/inspector-store`) reaches into the modal store
 * (`content/stores/modal-store`) by mutating `modalState.editingId` and then
 * calling `open()`, while the modal's `submit()` reads `modalState.editingId` to
 * pick update-vs-create. That cross-store contract is implicit and duplicated
 * with `modalOpenOptions.editingId`; consolidate onto one editing id (or an
 * explicit command) the next time modal/inspector state is refactored.
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
