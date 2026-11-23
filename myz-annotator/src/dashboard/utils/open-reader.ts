import type { Router } from "vue-router";
import {
  prepareEpubRecordInReader,
  preparePdfRecordForReader,
} from "@/reader/open.js";

type PdfRecordRef = Parameters<typeof preparePdfRecordForReader>[0];
type EpubRecordRef = Parameters<typeof prepareEpubRecordInReader>[0];

/**
 * Embeds a built reader URL in the workspace (`/read` host page) instead of
 * opening a tab: the whole workspace stays in one browser tab (§3.6 — the
 * reader keeps its own chrome, the workspace supplies the rail).
 */
export function openReaderInWorkspace(router: Router, targetUrl: string): void {
  const queryIndex = targetUrl.indexOf("?");
  const src = queryIndex >= 0 ? targetUrl.slice(queryIndex + 1) : "";
  const kind = targetUrl.includes("epub-viewer") ? "epub" : "pdf";
  void router.push({ path: "/read", query: { kind, src } });
}

/** Prepares the reader URL (permission first) and embeds it in the workspace. */
export async function openPdfInWorkspace(
  router: Router,
  record: PdfRecordRef,
): Promise<void> {
  const target = await preparePdfRecordForReader(record);
  if (target) openReaderInWorkspace(router, target);
}

/** EPUB twin of {@link openPdfInWorkspace}. */
export async function openEpubInWorkspace(
  router: Router,
  record: EpubRecordRef,
): Promise<void> {
  const target = await prepareEpubRecordInReader(record);
  if (target) openReaderInWorkspace(router, target);
}
