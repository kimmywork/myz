import type { Router } from "vue-router";
import { isLocalFileAccessError } from "@/reader/local-file.js";
import {
  prepareEpubRecordInReader,
  preparePdfRecordForReader,
} from "@/reader/open.js";

type PdfRecordRef = Parameters<typeof preparePdfRecordForReader>[0];
type EpubRecordRef = Parameters<typeof prepareEpubRecordInReader>[0];
/** The detail page needs the id; readers only need the locator fields. */
type WithId<T> = T & { id?: string };

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
  /**
   * Re-checked after the permission await, before anything navigates: a
   * browser permission prompt can outlive the user's stay on the page, and
   * navigating then would yank them into a reader they never asked for
   * (CodeRabbit #136). Returning false stops the whole open, fallbacks
   * included.
   */
  stillWanted?: () => boolean;
  /** Where to explain a blocked local-file open instead of navigating. */
  onError?: (message: string) => void;
}

/**
 * Runs the permission-first prepare step. A removed/denied local handle is a
 * user-facing outcome, not a navigation: report it and return `undefined`.
 */
async function prepare(
  prepareFn: () => Promise<string | null>,
  options: OpenReaderOptions,
): Promise<string | null | undefined> {
  try {
    return await prepareFn();
  } catch (error) {
    if (isLocalFileAccessError(error)) {
      options.onError?.((error as Error).message);
      return undefined;
    }
    throw error;
  }
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
 * (CodeRabbit #136). Returns false when the record has no address at all.
 */
function openRecordSource(record: {
  url?: string;
  sourceUrl?: string;
}): boolean {
  const candidate = [record.sourceUrl, record.url].find(
    (value) => typeof value === "string" && /^https?:/i.test(value),
  );
  if (!candidate) return false;
  chrome.tabs.create({ url: candidate });
  return true;
}

/**
 * The record's own detail page — the one destination that always exists, so a
 * click never ends in silence (an imported or locator-only record can have
 * neither a readable source nor a stored copy). Skipped when we are already
 * there: re-navigating to the current route would only reject as duplicated.
 */
function openRecordDetail(
  router: Router,
  record: { id?: string },
  options: OpenReaderOptions,
): void {
  if (!record.id) return;
  const path = `/highlights/${record.id}`;
  if (router.currentRoute.value.path === path) return;
  const navigate = options.replace
    ? router.replace.bind(router)
    : router.push.bind(router);
  void navigate({ path });
}

/** Shared prepare → guard → navigate flow for both document kinds. */
async function openInWorkspace(
  router: Router,
  record: WithId<PdfRecordRef> | WithId<EpubRecordRef>,
  prepareFn: () => Promise<string | null>,
  options: OpenReaderOptions,
): Promise<void> {
  const target = await prepare(prepareFn, options);
  if (target === undefined) return;
  if (options.stillWanted && !options.stillWanted()) return;
  if (!target) {
    if (!openRecordSource(record)) openRecordDetail(router, record, options);
    return;
  }
  openReaderInWorkspace(router, target, options);
}

/** Prepares the reader URL (permission first) and embeds it in the workspace. */
export function openPdfInWorkspace(
  router: Router,
  record: WithId<PdfRecordRef>,
  options: OpenReaderOptions = {},
): Promise<void> {
  return openInWorkspace(
    router,
    record,
    () => preparePdfRecordForReader(record),
    options,
  );
}

/** EPUB twin of {@link openPdfInWorkspace}. */
export function openEpubInWorkspace(
  router: Router,
  record: WithId<EpubRecordRef>,
  options: OpenReaderOptions = {},
): Promise<void> {
  return openInWorkspace(
    router,
    record,
    () => prepareEpubRecordInReader(record),
    options,
  );
}
