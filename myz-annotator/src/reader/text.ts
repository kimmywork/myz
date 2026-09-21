/**
 * Small text helpers shared by the reader chrome.
 */

/** Collapses whitespace and truncates for a one/two-line list row. */
export function excerpt(text: string, max = 72): string {
  const collapsed = (text || "").replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}
