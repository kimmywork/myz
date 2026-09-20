import {
  fingerprintBytes,
  type FileFingerprint,
} from "../reader/local-file.js";

export type PdfFingerprint = FileFingerprint;

/**
 * Content fingerprint for a local PDF (size + head/tail sample hash).
 *
 * Important: must be computed **before** the bytes are handed to pdf.js
 * (`getDocument({ data })` detaches the ArrayBuffer).
 */
export function fingerprintPdf(
  bytes: ArrayBuffer,
  sampleSize = 65536,
): Promise<PdfFingerprint> {
  return fingerprintBytes(bytes, sampleSize);
}
