import { SOURCE_TYPES } from "@myz/shared/types";
import { buildPdfSourceUrl } from "@myz/shared/url";
import {
  ensureReadPermission,
  fingerprintBytes,
  isPermissionError as isLocalFilePermissionError,
  localFilePermissionError,
  readHandle,
  supportsFileSystemAccess as supportsLocalFileSystemAccess,
  type FilePicker,
  type PermissionCapableHandle,
} from "../reader/local-file.js";
import { getFileHandle, putFileHandle } from "./storage";

export type PdfSourceRef =
  | { kind: "web"; url: string; title: string }
  | { kind: "local"; fingerprint: string; title: string };

export function sourceKeyOf(ref: PdfSourceRef): string {
  return ref.kind === "web" ? ref.url : buildPdfSourceUrl(ref.fingerprint);
}

export function sourceTypeOf(ref: PdfSourceRef): SOURCE_TYPES {
  return ref.kind === "web" ? SOURCE_TYPES.WEB : SOURCE_TYPES.PDF;
}

export function supportsFileSystemAccess(): boolean {
  return supportsLocalFileSystemAccess();
}

export function localPdfPermissionError(): Error {
  return localFilePermissionError();
}

export function isPermissionError(err: unknown): boolean {
  return isLocalFilePermissionError(err);
}

/**
 * Requests read permission for a stored local PDF while the caller still has
 * user activation (e.g. a click in the dashboard), so the reader tab can read
 * the handle without prompting. Returns whether permission is granted.
 */
export async function ensureLocalPdfPermission(
  fingerprint: string,
): Promise<boolean> {
  const handle = await getFileHandle<PermissionCapableHandle>(fingerprint);
  if (!handle) {
    return false;
  }
  return ensureReadPermission(handle);
}

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

export async function pickLocalPdf(): Promise<{
  ref: PdfSourceRef;
  bytes: ArrayBuffer;
} | null> {
  const picker = (window as unknown as { showOpenFilePicker?: FilePicker })
    .showOpenFilePicker;
  if (!picker) {
    throw new Error("当前浏览器不支持打开本地文件");
  }
  const [handle] = await picker({
    types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
  });
  if (!handle) {
    return null;
  }
  const bytes = await readHandle(handle);
  const fingerprint = await fingerprintBytes(bytes);
  await putFileHandle(fingerprint.hash, handle);
  return {
    ref: {
      kind: "local",
      fingerprint: fingerprint.hash,
      title: handle.name || "本地 PDF",
    },
    bytes,
  };
}

export async function restoreLocalPdf(
  fingerprint: string,
  title?: string,
): Promise<{ ref: PdfSourceRef; bytes: ArrayBuffer } | null> {
  const handle = await getFileHandle<PermissionCapableHandle>(fingerprint);
  if (!handle) {
    return null;
  }
  const bytes = await readHandle(handle);
  return {
    ref: {
      kind: "local",
      fingerprint,
      title: title || handle.name || "本地 PDF",
    },
    bytes,
  };
}
