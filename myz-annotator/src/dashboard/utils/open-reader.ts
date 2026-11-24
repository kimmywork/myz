import type { Router } from "vue-router";
import {
  prepareEpubRecordInReader,
  preparePdfRecordForReader,
} from "@/reader/open.js";

type PdfRecordRef = Parameters<typeof preparePdfRecordForReader>[0];
type EpubRecordRef = Parameters<typeof prepareEpubRecordInReader>[0];

/** Which viewer entrypoint a built reader URL points at. */
export function readerKindOf(targetUrl: string): "pdf" | "epub" {
  // The *pathname* only: a source like `epub-viewer-notes.pdf` rides along in
  // the query string and must not flip the kind (CodeRabbit #133).
  const pathname = new URL(targetUrl, "https://placeholder.invalid").pathname;
  return pathname.endsWith("epub-viewer.html") ? "epub" : "pdf";
}

export interface OpenReaderOptions {
  /**
   * Replace the current history entry instead of pushing. Automatic
   * redirects (a PDF/EPUB record arriving at the snapshot detail) must
   * replace, or Back re-enters the detail and redirects again, trapping the
   * user (CodeRabbit #136).
   */
  replace?: boolean;
}

/**
 * Embeds a built reader URL in the workspace (`/read` host page) instead of
 * opening a tab: the whole workspace stays in one browser tab (§3.6 — the
 * reader keeps its own chrome, the workspace supplies the rail).
 */
export function openReaderInWorkspace(
  router: Router,
  targetUrl: string,
  options: OpenReaderOptions = {},
): void {
  const queryIndex = targetUrl.indexOf("?");
  const src = queryIndex >= 0 ? targetUrl.slice(queryIndex + 1) : "";
  const kind = readerKindOf(targetUrl);
  const navigate = options.replace
    ? router.replace.bind(router)
    : router.push.bind(router);
  void navigate({ path: "/read", query: { kind, src } });
}

/**
 * Last resort when no reader target can be built (a record may carry a
 * locator but no fingerprint/source the viewer can open): open the record's
 * original document in a tab rather than leaving the click dead
 * (CodeRabbit #136).
 */
function openRecordSource(record: { url?: string; sourceUrl?: string }): void {
  const candidate = [record.sourceUrl, record.url].find(
    (value) => typeof value === "string" && /^https?:/i.test(value),
  );
  if (candidate) chrome.tabs.create({ url: candidate });
}

/** Prepares the reader URL (permission first) and embeds it in the workspace. */
export async function openPdfInWorkspace(
  router: Router,
  record: PdfRecordRef,
  options: OpenReaderOptions = {},
): Promise<void> {
  const target = await preparePdfRecordForReader(record);
  if (!target) {
    openRecordSource(record);
    return;
  }
  openReaderInWorkspace(router, target, options);
}

/** EPUB twin of {@link openPdfInWorkspace}. */
export async function openEpubInWorkspace(
  router: Router,
  record: EpubRecordRef,
  options: OpenReaderOptions = {},
): Promise<void> {
  const target = await prepareEpubRecordInReader(record);
  if (!target) {
    openRecordSource(record);
    return;
  }
  openReaderInWorkspace(router, target, options);
}
