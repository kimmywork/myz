/**
 * Filename conventions for captures and exports.
 *
 * - Editor exports / screenshots: `myz-<type>-<timestamp>.png`
 *   (type ∈ stitch | collage | showcase | screenshot | image).
 * - Video frames: `myz-video-<host>-<url-path>-<timestamp>.png`, so a batch of
 *   frames is self-describing and sorts chronologically.
 */

/** Compact, filesystem-safe local timestamp: `YYYYMMDD-HHmmss`. */
export function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** `myz-<type>-<timestamp>` (no extension; callers append one). */
export function buildSimpleName(type: string, date = new Date()): string {
  return `myz-${sanitizeSegment(type) || "capture"}-${formatTimestamp(date)}`;
}

function sanitizeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** `myz-video-<host>-<url-path>-<timestamp>` (no extension). */
export function buildVideoName(
  sourceUrl: string | undefined,
  date = new Date(),
): string {
  const parts = ["myz", "video"];
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const host = url.hostname.replace(/^www\./, "");
        if (host) parts.push(sanitizeSegment(host));
        const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
        const cleanPath = sanitizeSegment(decodeURIComponent(path));
        if (cleanPath) parts.push(cleanPath);
      }
    } catch {
      // Non-URL sources (blob:, data:) fall back to the timestamp-only name.
    }
  }
  parts.push(formatTimestamp(date));
  return parts.join("-");
}
