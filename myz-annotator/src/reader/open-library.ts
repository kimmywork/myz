/** Message a reader iframe posts to leave the workspace embed. */
export const READER_CLOSE_MESSAGE = "myz:reader-close";

/**
 * Navigates back to the dashboard library.
 *
 * Standalone (popup / context menu): a same-tab navigation — it reads like
 * the browser back button returning to the library. Embedded in the
 * workspace: the parent owns the surface, so the reader only asks it to
 * close the embed and the workspace route goes back.
 */
export function openLibrary(): void {
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: READER_CLOSE_MESSAGE },
      window.location.origin,
    );
    return;
  }
  window.location.assign(chrome.runtime.getURL("src/dashboard/index.html"));
}
