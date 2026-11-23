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
 * Prepares the reader target for a PDF record: requests the local-file read
 * permission first, while the originating click still provides user
 * activation — a freshly opened surface has none, so `requestPermission`
 * inside the reader would be rejected. Returns null when the record carries
 * no usable PDF source.
 */
export async function preparePdfRecordForReader(
  record: PdfRecordRef,
): Promise<string | null> {
  const target = buildPdfReaderUrl(record);
  if (!target) {
    return null;
  }
  const fingerprint = fingerprintOf(record);
  if (fingerprint) {
    await ensureLocalPdfPermission(fingerprint);
  }
  return target;
}

/**
 * Opens a PDF record in a standalone reader tab. Dashboard surfaces embed the
 * reader in the workspace instead (prepare + `/read` host page).
 */
export async function openPdfRecordInReader(
  record: PdfRecordRef,
): Promise<void> {
  const target = await preparePdfRecordForReader(record);
  if (target) {
    chrome.tabs.create({ url: target });
  }
}
