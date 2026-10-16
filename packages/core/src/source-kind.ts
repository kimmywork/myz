import {
  EPUB_SOURCE_URL_PREFIX,
  PDF_SOURCE_URL_PREFIX,
  SOURCE_TYPES,
} from "@myz/shared/types";

/** How a source kind is identified across hosts and devices. */
export type SourceIdentityScheme = "url" | "fingerprint";

export interface SourceCapabilities {
  /** Fixed-page document (has a page count). */
  paged?: boolean;
  /** Reflowable document (no fixed pages). */
  reflow?: boolean;
  /** Time-based media (position is a time range). */
  temporal?: boolean;
}

export interface SourceKindDef {
  kind: string;
  identity: SourceIdentityScheme;
  capabilities: SourceCapabilities;
  /** Synthetic `url` prefix for local-file sources, when applicable. */
  urlPrefix?: string;
}

/** Built-in source kinds. New media (docx/video/image) register here. */
export const BUILTIN_SOURCE_KINDS: readonly SourceKindDef[] = [
  { kind: SOURCE_TYPES.WEB, identity: "url", capabilities: {} },
  {
    kind: SOURCE_TYPES.PDF,
    identity: "fingerprint",
    capabilities: { paged: true },
    urlPrefix: PDF_SOURCE_URL_PREFIX,
  },
  {
    kind: SOURCE_TYPES.EPUB,
    identity: "fingerprint",
    capabilities: { reflow: true },
    urlPrefix: EPUB_SOURCE_URL_PREFIX,
  },
];

export interface SourceKindRegistry {
  register(def: SourceKindDef): void;
  get(kind: string): SourceKindDef | undefined;
  list(): SourceKindDef[];
}

export function createSourceKindRegistry(
  initial: readonly SourceKindDef[] = BUILTIN_SOURCE_KINDS,
): SourceKindRegistry {
  const byKind = new Map<string, SourceKindDef>(
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

/** Shared registry with the built-in web/pdf/epub kinds pre-registered. */
export const sourceKinds = createSourceKindRegistry();
