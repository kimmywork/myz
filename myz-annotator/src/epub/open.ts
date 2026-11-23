import type { MyZRecord } from "@myz/shared/types";
import { epubFingerprintFromSourceUrl } from "@myz/shared/url";
import { ensureLocalEpubPermission } from "./source.js";

type EpubRecordRef = Pick<MyZRecord, "url" | "sourceUrl" | "epubLocator">;

function fingerprintOf(record: EpubRecordRef): string | null {
  return (
    epubFingerprintFromSourceUrl(record.sourceUrl) ??
    epubFingerprintFromSourceUrl(record.url)
  );
}

/**
 * Builds the reader page url that opens an EPUB record at its recorded spot.
 * EPUB has no page numbers, so the location is a spine index plus an optional
 * 0–1 progression.
 */
export function buildEpubReaderUrl(record: EpubRecordRef): string | null {
  const locator = record.epubLocator;
  const fingerprint = fingerprintOf(record);
  if (!fingerprint) {
    return null;
  }
  const params = new URLSearchParams();
  params.set("fp", fingerprint);
  if (locator) {
    params.set("spine", String(locator.spineIndex));
    if (typeof locator.progression === "number") {
      params.set("prog", String(locator.progression));
    }
  }
  return `${chrome.runtime.getURL("src/epub/epub-viewer.html")}?${params.toString()}`;
}

/**
 * Prepares the reader target for an EPUB record (permission first, while the
 * click still has user activation). Returns null without a fingerprint.
 */
export async function prepareEpubRecordInReader(
  record: EpubRecordRef,
): Promise<string | null> {
  const target = buildEpubReaderUrl(record);
  if (!target) {
    return null;
  }
  const fingerprint = fingerprintOf(record);
  if (fingerprint) {
    await ensureLocalEpubPermission(fingerprint);
  }
  return target;
}

/** Opens an EPUB record in a standalone reader tab. */
export async function openEpubRecordInReader(
  record: EpubRecordRef,
): Promise<void> {
  const target = await prepareEpubRecordInReader(record);
  if (target) {
    chrome.tabs.create({ url: target });
  }
}
