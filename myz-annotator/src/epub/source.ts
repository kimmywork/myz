import { SOURCE_TYPES } from "@myz/shared/types";
import { buildEpubSourceUrl } from "@myz/shared/url";
import { createLocalFileSource, createReaderSource } from "../reader/source.js";
import { getFileHandle, putFileHandle } from "./storage";

export type EpubSourceRef = {
  kind: "local";
  fingerprint: string;
  title: string;
};

const source = createReaderSource<EpubSourceRef>({
  type: SOURCE_TYPES.EPUB,
  buildUrl: buildEpubSourceUrl,
  webUrl: () => null,
  fingerprintOf: (ref) => ref.fingerprint,
  getFileHandle,
});

export const sourceKeyOf = source.sourceKeyOf;

export function sourceTypeOf(): SOURCE_TYPES {
  return SOURCE_TYPES.EPUB;
}

export const supportsFileSystemAccess = source.supportsFileSystemAccess;

/**
 * Requests read permission for a stored local EPUB while the caller still has
 * user activation, so the reader tab can read the handle without prompting.
 */
export const ensureLocalEpubPermission = source.ensurePermission;

const localFiles = createLocalFileSource<EpubSourceRef>({
  description: "EPUB",
  accept: { "application/epub+zip": [".epub"] },
  defaultTitle: "本地 EPUB",
  getFileHandle,
  putFileHandle,
  makeRef: (fingerprint, title) => ({ kind: "local", fingerprint, title }),
});

export const pickLocalEpub = localFiles.pickLocal;
export const restoreLocalEpub = localFiles.restoreLocal;
