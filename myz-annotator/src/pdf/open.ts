import type { MyZRecord } from "@myz/shared/types";
import { isPdfSourceUrl, pdfFingerprintFromSourceUrl } from "@myz/shared/url";
import { ensureLocalPdfPermission } from "./source.js";

type PdfRecordRef = Pick<MyZRecord, "url" | "sourceUrl" | "pdfLocator">;

function fingerprintOf(record: PdfRecordRef): string | null {
  const source = record.sourceUrl || record.url;
  return (
    pdfFingerprintFromSourceUrl(source) ??
    pdfFingerprintFromSourceUrl(record.url)
  );
}

/**
 * Builds the reader page url that opens a PDF record at its recorded page.
 * Web PDFs use `?url=`, local PDFs use the stored fingerprint (`?fp=`).
 */
export function buildPdfReaderUrl(record: PdfRecordRef): string | null {
  const locator = record.pdfLocator;
  if (!locator) {
    return null;
  }
  const params = new URLSearchParams();
  const source = record.sourceUrl || record.url;
  const fingerprint = fingerprintOf(record);
  if (fingerprint) {
    params.set("fp", fingerprint);
  } else if (source && !isPdfSourceUrl(source)) {
    params.set("url", source);
  } else {
    return null;
  }
  if (locator.pageNumber) {
    params.set("page", String(locator.pageNumber));
  }
  return `${chrome.runtime.getURL("src/pdf/pdf-viewer.html")}?${params.toString()}`;
}

/**
 * Opens a PDF record in the reader. For local PDFs, read permission is
 * requested here first, while the originating click still provides user
 * activation — a freshly created tab has none, so `requestPermission` inside
 * the reader would be rejected.
 */
export async function openPdfRecordInReader(
  record: PdfRecordRef,
): Promise<void> {
  const target = buildPdfReaderUrl(record);
  if (!target) {
    return;
  }
  const fingerprint = fingerprintOf(record);
  if (fingerprint) {
    await ensureLocalPdfPermission(fingerprint);
  }
  chrome.tabs.create({ url: target });
}
