import type { MyZRecord } from "@myz/shared/types";
import { isPdfSourceUrl, pdfFingerprintFromSourceUrl } from "@myz/shared/url";

type PdfRecordRef = Pick<MyZRecord, "url" | "sourceUrl" | "pdfLocator">;

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
  const fingerprint =
    pdfFingerprintFromSourceUrl(source) ??
    pdfFingerprintFromSourceUrl(record.url);
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

export function openPdfRecordInReader(record: PdfRecordRef): void {
  const target = buildPdfReaderUrl(record);
  if (target) {
    chrome.tabs.create({ url: target });
  }
}
