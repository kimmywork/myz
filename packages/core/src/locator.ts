/**
 * Locator model: how a position inside a source is addressed.
 *
 * Historically the three locator shapes were flat optional fields on the
 * record (`range` / `pdfLocator` / `epubLocator`). This module makes the kind
 * explicit and provides read-time normalization (§10/5) — records are NOT
 * rewritten, because re-serializing them would change their sync hash.
 */

export type LocatorKind =
  | "text-range"
  | "pdf-page-rect"
  | "epub"
  | "video-time"
  | "image-region";

export interface LocatorKindDef {
  kind: LocatorKind;
  /** Reserved kinds are modelled but not produced yet. */
  reserved?: boolean;
}

export const BUILTIN_LOCATOR_KINDS: readonly LocatorKindDef[] = [
  { kind: "text-range" },
  { kind: "pdf-page-rect" },
  { kind: "epub" },
  { kind: "video-time", reserved: true },
  { kind: "image-region", reserved: true },
];

export interface LocatorKindRegistry {
  register(def: LocatorKindDef): void;
  get(kind: string): LocatorKindDef | undefined;
  list(): LocatorKindDef[];
}

export function createLocatorKindRegistry(
  initial: readonly LocatorKindDef[] = BUILTIN_LOCATOR_KINDS,
): LocatorKindRegistry {
  const byKind = new Map<string, LocatorKindDef>(
    initial.map((def) => [def.kind, def]),
  );
  return {
    register(def) {
      byKind.set(def.kind, def);
    },
    get(kind) {
      return byKind.get(kind);
    },
    list() {
      return [...byKind.values()];
    },
  };
}

/** A position inside a source, discriminated by kind. */
export interface Locator {
  kind: LocatorKind;
  value: unknown;
}

/** The legacy flat locator fields still persisted on records. */
export interface LocatorFields {
  range?: unknown;
  pdfLocator?: unknown;
  epubLocator?: unknown;
}

/**
 * Read-time normalization: pick the locator kind from whichever legacy field is
 * present. Order matters (text range wins), matching how records are written.
 */
export function normalizeLocator(fields: LocatorFields): Locator | null {
  if (fields.range != null) {
    return { kind: "text-range", value: fields.range };
  }
  if (fields.pdfLocator != null) {
    return { kind: "pdf-page-rect", value: fields.pdfLocator };
  }
  if (fields.epubLocator != null) {
    return { kind: "epub", value: fields.epubLocator };
  }
  return null;
}
