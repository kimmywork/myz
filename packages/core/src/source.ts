/**
 * Source / locator resolution (read-time, no record rewrite).
 *
 * Records persist `sourceType` plus flat `range` / `pdfLocator` / `epubLocator`
 * fields. This module derives the source kind (via the registry) and a typed
 * locator from those fields **without writing anything back** — rewriting a
 * record would change its sync hash (plan §10/5).
 */
import { SOURCE_TYPES, type MyZRecord } from "@myz/shared/types";
import { sourceKinds, type SourceKindDef } from "./source-kind";

/** URL prefixes used by local-file sources (`myz-pdf:` / `myz-epub:`). */
const PREFIX_TO_KIND: ReadonlyArray<readonly [string, string]> = [
  ["myz-pdf:", SOURCE_TYPES.PDF],
  ["myz-epub:", SOURCE_TYPES.EPUB],
];

/** Safe url extraction: malformed persisted values must not throw. */
function recordUrl(record: Partial<MyZRecord>): string {
  const url = record?.url ?? record?.sourceUrl;
  return typeof url === "string" ? url : "";
}

/** Resolve a record's source kind from its `sourceType` or synthetic url. */
export function resolveSourceKind(
  record: Partial<MyZRecord>,
): SourceKindDef | undefined {
  const declared = record?.sourceType;
  if (typeof declared === "string" && sourceKinds.get(declared)) {
    return sourceKinds.get(declared);
  }
  const url = recordUrl(record);
  for (const [prefix, kind] of PREFIX_TO_KIND) {
    if (url.startsWith(prefix)) return sourceKinds.get(kind);
  }
  return sourceKinds.get(SOURCE_TYPES.WEB);
}

/** Source identity: a url for web sources, a fingerprint key for local files. */
export interface SourceIdentity {
  kind: string;
  scheme: "url" | "fingerprint";
  value: string;
}

export function resolveSourceIdentity(
  record: Partial<MyZRecord>,
): SourceIdentity | null {
  const def = resolveSourceKind(record);
  const url = recordUrl(record);
  if (!def) return null;
  if (def.identity === "url") {
    return url ? { kind: def.kind, scheme: "url", value: url } : null;
  }
  // Fingerprint sources encode their key in the synthetic url prefix.
  const value = url.startsWith(def.urlPrefix ?? "")
    ? url.slice((def.urlPrefix ?? "").length)
    : url;
  return value ? { kind: def.kind, scheme: "fingerprint", value } : null;
}

/** A record's anchor, discriminated by kind (typed for UI use). */
export type ResolvedLocator =
  | { kind: "text-range"; value: NonNullable<MyZRecord["range"]> }
  | { kind: "pdf-page-rect"; value: NonNullable<MyZRecord["pdfLocator"]> }
  | { kind: "epub"; value: NonNullable<MyZRecord["epubLocator"]> };

/**
 * Source-specific reader anchor: PDF page / EPUB chapter. PDF/EPUB records also
 * carry a generic `range`, so reader actions must use these fields first.
 */
export function resolveReaderLocator(
  record: Partial<MyZRecord>,
):
  | { kind: "pdf-page-rect"; value: NonNullable<MyZRecord["pdfLocator"]> }
  | { kind: "epub"; value: NonNullable<MyZRecord["epubLocator"]> }
  | null {
  if (record?.pdfLocator != null) {
    return { kind: "pdf-page-rect", value: record.pdfLocator };
  }
  if (record?.epubLocator != null) {
    return { kind: "epub", value: record.epubLocator };
  }
  return null;
}

/**
 * Read-time locator normalization. Preserves the historical precedence
 * (text range → pdf → epub) so existing records resolve the same way.
 */
export function resolveRecordLocator(
  record: Partial<MyZRecord>,
): ResolvedLocator | null {
  if (record?.range != null) {
    return { kind: "text-range", value: record.range };
  }
  if (record?.pdfLocator != null) {
    return { kind: "pdf-page-rect", value: record.pdfLocator };
  }
  if (record?.epubLocator != null) {
    return { kind: "epub", value: record.epubLocator };
  }
  return null;
}
