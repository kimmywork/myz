/**
 * Reader open entry points, re-exported through one facade so dashboard
 * surfaces depend on the reader layer rather than the pdf/epub internals
 * directly (L4).
 */
export { openEpubRecordInReader } from "../epub/open.js";
export { openPdfRecordInReader } from "../pdf/open.js";
