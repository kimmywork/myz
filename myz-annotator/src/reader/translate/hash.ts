/**
 * Text hashing for the translation cache key.
 *
 * Uses WebCrypto when available (extension pages are secure contexts) and a
 * deterministic FNV-1a fallback otherwise. Both are injectable so the service
 * layer stays testable without a browser.
 */

const encoder = new TextEncoder();

function fallbackHash(text: string): string {
  let low = 0x811c9dc5;
  let high = 0x9dc5811c;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ (code + index), 0x01000193) >>> 0;
  }
  return `${low.toString(16).padStart(8, "0")}${high
    .toString(16)
    .padStart(8, "0")}`;
}

export async function hashText(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return fallbackHash(text);
  }
  try {
    const digest = await subtle.digest("SHA-256", encoder.encode(text));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return fallbackHash(text);
  }
}
