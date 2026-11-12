/**
 * Placing a record's text inside a snapshot (§I9).
 *
 * A snapshot is a stored copy, so the original range path no longer means
 * anything: the page it pointed into is gone or has changed. Placement is a
 * three-step descent, and it never guesses:
 *
 * 1. `unique`  — the record's text occurs exactly once in the snapshot;
 * 2. `missing` — it does not occur at all;
 * 3. `ambiguous` — it occurs more than once, so there is no honest answer.
 *
 * `missing` and `ambiguous` both end up `unlocated`: showing a highlight on a
 * look-alike passage is worse than showing none, because a user who sees one
 * highlight land in the wrong place stops trusting all of them.
 *
 * The range→text step of the contract's three levels is implicit here: a
 * snapshot has no usable range at all, so the honest first level is the text
 * comparison. Both are recorded in the result (`basis`) so the reason is
 * visible rather than assumed.
 */

export type AnchorBasis = "range" | "text" | "none";

export interface SnapshotAnchor {
  /** Where the text landed, when it landed at all. */
  basis: AnchorBasis;
  status: "located" | "unlocated";
  /** Matches found in the snapshot. */
  matches: number;
  /** Plain-language reason, shown to the user when unlocated. */
  reason?: string;
}

/** Collapses whitespace the same way both sides of a comparison must. */
export function normalizeAnchorText(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * Counts non-overlapping occurrences of `needle` in `haystack`, both already
 * whitespace-normalized.
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Decides how (and whether) a record's text can be placed in a snapshot.
 *
 * @param recordText The record's own text.
 * @param snapshotText The snapshot body's text, whitespace-normalized.
 */
export function resolveSnapshotAnchor(
  recordText: string | undefined,
  snapshotText: string,
): SnapshotAnchor {
  const needle = normalizeAnchorText(recordText);
  if (!needle) {
    return {
      basis: "none",
      status: "unlocated",
      matches: 0,
      reason: "这条记录没有文字，无法在快照里定位",
    };
  }

  const haystack = normalizeAnchorText(snapshotText);
  const matches = countOccurrences(haystack, needle);

  if (matches === 1) {
    return { basis: "text", status: "located", matches };
  }
  if (matches === 0) {
    return {
      basis: "text",
      status: "unlocated",
      matches,
      reason: "快照里找不到这段文字（原页可能已改版）",
    };
  }
  return {
    basis: "text",
    status: "unlocated",
    matches,
    reason: `快照里这段文字出现了 ${matches} 次，无法确定是哪一处`,
  };
}
