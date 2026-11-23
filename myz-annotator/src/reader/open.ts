/**
 * Reader open entry points, re-exported through one facade so dashboard
 * surfaces depend on the reader layer rather than the pdf/epub internals
 * directly (L4).
 *
 * `prepare*` returns the built reader URL after requesting local-file
 * permission (it must run inside a user gesture); the dashboard embeds that
 * URL in the workspace while popup/context-menu open a standalone tab.
 */
export {
  openEpubRecordInReader,
  prepareEpubRecordInReader,
} from "../epub/open.js";
export {
  openPdfRecordInReader,
  preparePdfRecordForReader,
} from "../pdf/open.js";
