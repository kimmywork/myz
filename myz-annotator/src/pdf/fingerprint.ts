export interface PdfFingerprint {
  size: number;
  sampleBytes: number;
  hash: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Content fingerprint for a local PDF based on its size plus the first and
 * last `sampleSize` bytes. Avoids reading/hashing the whole file while still
 * distinguishing documents.
 *
 * Important: must be computed **before** the bytes are handed to pdf.js
 * (`getDocument({ data })` detaches the ArrayBuffer).
 */
export async function fingerprintPdf(
  bytes: ArrayBuffer,
  sampleSize = 65536,
): Promise<PdfFingerprint> {
  const u8 = new Uint8Array(bytes);
  const size = u8.byteLength;
  const head = u8.slice(0, Math.min(sampleSize, size));
  const tail = u8.slice(Math.max(0, size - sampleSize));
  const payload = new Uint8Array(8 + head.length + tail.length);
  new DataView(payload.buffer).setFloat64(0, size);
  payload.set(head, 8);
  payload.set(tail, 8 + head.length);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return { size, sampleBytes: head.length + tail.length, hash: toHex(digest) };
}
