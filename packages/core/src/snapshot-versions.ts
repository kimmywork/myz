/**
 * "Is this the same page?" for snapshot versions (§I9).
 *
 * Two captures of the same URL are two versions of one page; captures of
 * different pages must never be merged into versions of each other.
 *
 * The rewrite is deliberately narrow: it drops the fragment and a **closed
 * list** of known-tracking/positioning parameters, and keeps everything else,
 * sorted. Dropping an unknown parameter would risk showing one version's body
 * under another version's date — a content mix-up — while keeping one parameter
 * too many only costs a redundant version. Redundancy is recoverable; a
 * mislabelled body is not.
 */

/**
 * Parameters that never change which content the page returns:
 * campaign/click tracking, and player/scroll positions.
 */
const NOISE_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "ref_url",
  "referrer",
  "spm",
  "si",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
  "utm_id",
  "utm_name",
  "utm_reader",
  "utm_social",
  "utm_brand",
]);

/**
 * A playback position: `83`, `83s`, `1m23s`, `1h2m3s`. Only this shape of `t=`
 * is treated as noise — a bare `t=page` or `t=chapter` is content on some
 * sites, and guessing would merge two different pages.
 */
const PLAYBACK_POSITION = /^(?:\d+(?:h|m|s)?)+$/i;

/**
 * True for a parameter that only carries tracking or playback-position noise.
 *
 * @param name Parameter name.
 * @param value Its value, needed for shapes that are only noise sometimes.
 */
export function isNoiseParameter(name: string, value = ""): boolean {
  const key = name.toLowerCase();
  if (NOISE_PARAMETERS.has(key)) return true;
  // `utm_*` is an open-ended family; every member is tracking.
  if (key.startsWith("utm_")) return true;
  if (key === "t") return PLAYBACK_POSITION.test(value.trim());
  return false;
}

/**
 * Canonical form of a URL for version grouping.
 *
 * Keeps the origin, path and every non-noise parameter (sorted, so the order
 * cannot create a fake difference). Returns the input unchanged when it cannot
 * be parsed — an unparseable URL must not be grouped with anything.
 */
export function canonicalSnapshotUrl(raw: string): string {
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const params = [...url.searchParams.entries()]
    .filter(([name, value]) => !isNoiseParameter(name, value))
    .sort(([a], [b]) => a.localeCompare(b));

  const query = params.length
    ? `?${params
        .map(
          ([name, value]) =>
            `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
        )
        .join("&")}`
    : "";

  // `origin + pathname` drops the fragment and any default port noise.
  return `${url.origin}${url.pathname}${query}`;
}

/** A stored snapshot, as far as grouping cares. */
export interface VersionEntry {
  id: string;
  url: string;
  createdAt: string;
}

export interface SnapshotVersions<T extends VersionEntry = VersionEntry> {
  /** Same canonical URL, newest first. */
  versions: T[];
  /** Index of the newest entry, which the view shows by default. */
  newestIndex: number;
}

/**
 * Groups snapshots of the same page, newest first.
 *
 * @param snapshots All snapshots of one record (or one page).
 */
export function groupVersions<T extends VersionEntry>(
  snapshots: readonly T[],
): SnapshotVersions<T> {
  const versions = [...snapshots].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return { versions, newestIndex: versions.length ? 0 : -1 };
}

/**
 * Splits snapshots into groups keyed by canonical URL, each newest first.
 *
 * The order of the groups follows the newest member, so the freshest page
 * leads.
 */
export function groupByCanonicalUrl<T extends VersionEntry>(
  snapshots: readonly T[],
): Array<SnapshotVersions<T>> {
  const byKey = new Map<string, T[]>();
  for (const snapshot of snapshots) {
    const key = canonicalSnapshotUrl(snapshot.url);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(snapshot);
    else byKey.set(key, [snapshot]);
  }
  return [...byKey.values()]
    .map((group) => groupVersions(group))
    .sort((a, b) =>
      (b.versions[0]?.createdAt ?? "").localeCompare(
        a.versions[0]?.createdAt ?? "",
      ),
    );
}
