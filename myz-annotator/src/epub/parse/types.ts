export const XHTML_MEDIA_TYPE = "application/xhtml+xml";
export const NCX_MEDIA_TYPE = "application/x-dtbncx+xml";

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  identifier: string;
  publisher: string;
  spineCount: number;
}

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface EpubSpineItem {
  idref: string;
  href: string;
  linear: boolean;
}

export interface EpubTocEntry {
  label: string;
  href: string;
  depth: number;
  children: EpubTocEntry[];
}

export interface EpubBook {
  opfPath: string;
  opfDir: string;
  metadata: EpubMetadata;
  manifest: EpubManifestItem[];
  spine: EpubSpineItem[];
  toc: EpubTocEntry[];
  coverPath: string | null;
  files: Map<string, Uint8Array<ArrayBuffer>>;
}
