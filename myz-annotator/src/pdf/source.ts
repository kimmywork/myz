import { SOURCE_TYPES } from "@myz/shared/types";
import { buildPdfSourceUrl } from "@myz/shared/url";
import { createLocalFileSource, createReaderSource } from "../reader/source.js";
import { getFileHandle, putFileHandle } from "./storage";

export type PdfSourceRef =
  | { kind: "web"; url: string; title: string }
  | { kind: "local"; fingerprint: string; title: string };

const source = createReaderSource<PdfSourceRef>({
  type: SOURCE_TYPES.PDF,
  buildUrl: buildPdfSourceUrl,
  webUrl: (ref) => (ref.kind === "web" ? ref.url : null),
  fingerprintOf: (ref) => (ref.kind === "local" ? ref.fingerprint : null),
  getFileHandle,
});

export const sourceKeyOf = source.sourceKeyOf;
export const sourceTypeOf = source.sourceTypeOf;
export const supportsFileSystemAccess = source.supportsFileSystemAccess;
export const localPdfPermissionError = source.localPermissionError;
export const isPermissionError = source.isPermissionError;

/**
 * Requests read permission for a stored local PDF while the caller still has
 * user activation (e.g. a click in the dashboard), so the reader tab can read
 * the handle without prompting. Returns whether permission is granted.
 */
export const ensureLocalPdfPermission = source.ensurePermission;

export function titleFromPdfUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || parsed.hostname;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
}

const localFiles = createLocalFileSource<PdfSourceRef>({
  description: "PDF",
  accept: { "application/pdf": [".pdf"] },
  defaultTitle: "本地 PDF",
  getFileHandle,
  putFileHandle,
  makeRef: (fingerprint, title) => ({ kind: "local", fingerprint, title }),
});

export const pickLocalPdf = localFiles.pickLocal;
export const restoreLocalPdf = localFiles.restoreLocal;
