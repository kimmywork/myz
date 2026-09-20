/**
 * Navigates the current reader tab back to the dashboard library.
 *
 * Each reader is its own extension page, so "返回文库" is a same-tab
 * navigation; it reads like the browser back button returning to the library.
 */
export function openLibrary(): void {
  window.location.assign(chrome.runtime.getURL("src/dashboard/index.html"));
}
