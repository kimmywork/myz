import { extractPdfUrlFromBrowserUrl } from "@myz/shared/url";

export type PdfProbe = (url: string) => Promise<boolean>;

const PDF_MIME = /application\/pdf/i;
const PROBE_TIMEOUT_MS = 8000;

/**
 * Probes a URL to decide whether it serves a PDF, using a ranged request so
 * only the headers (plus at most one byte) are transferred. Works from
 * extension contexts where host permissions bypass CORS.
 */
export async function probeIsPdfUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    try {
      await response.body?.cancel();
    } catch {
      // body already consumed/closed
    }
    if (PDF_MIME.test(contentType)) {
      return true;
    }
    return /filename\*?=.*\.pdf/i.test(disposition);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the PDF url behind a browser tab/link url.
 * Fast path: direct `.pdf` urls and the built-in viewer urls.
 * Fallback: content-type probe for urls without a `.pdf` suffix (e.g.
 * `https://arxiv.org/pdf/2606.19348`).
 */
export async function resolvePdfTargetUrl(
  candidate: string | undefined | null,
  probe: PdfProbe = probeIsPdfUrl,
): Promise<string | null> {
  if (!candidate) {
    return null;
  }
  const direct = extractPdfUrlFromBrowserUrl(candidate);
  if (direct) {
    return direct;
  }
  if (!/^https?:\/\//i.test(candidate)) {
    return null;
  }
  return (await probe(candidate)) ? candidate : null;
}
