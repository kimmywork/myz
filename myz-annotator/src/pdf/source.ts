import { SOURCE_TYPES } from "@myz/shared/types";
import { buildPdfSourceUrl } from "@myz/shared/url";
import { fingerprintPdf } from "./fingerprint";
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

interface PermissionCapableHandle {
  name?: string;
  queryPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
  getFile(): Promise<File>;
}

type FilePicker = (options: unknown) => Promise<PermissionCapableHandle[]>;

export function supportsFileSystemAccess(): boolean {
  return (
    typeof (window as unknown as { showOpenFilePicker?: unknown })
      .showOpenFilePicker === "function"
  );
}

/**
 * Raised when a stored local-file handle needs a permission re-grant that
 * requires transient user activation (which a freshly program-opened tab does
 * not have).
 */
export function localPdfPermissionError(): Error {
  const err = new Error("需要重新授权访问该本地文件，请点击「重新授权并打开」");
  err.name = "LocalPdfPermissionError";
  return err;
}

export function isPermissionError(err: unknown): boolean {
  return err instanceof Error && err.name === "LocalPdfPermissionError";
}

async function readHandle(
  handle: PermissionCapableHandle,
): Promise<ArrayBuffer> {
  if (handle.queryPermission) {
    const current = await handle.queryPermission({ mode: "read" });
    if (current !== "granted") {
      if (!handle.requestPermission) {
        throw localPdfPermissionError();
      }
      try {
        const next = await handle.requestPermission({ mode: "read" });
        if (next !== "granted") {
          throw localPdfPermissionError();
        }
      } catch (err) {
        // Browsers reject requestPermission without user activation; surface a
        // recoverable error instead of the raw DOMException.
        throw isPermissionError(err) ? err : localPdfPermissionError();
      }
    }
  }
  const file = await handle.getFile();
  return file.arrayBuffer();
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
  if (!handle?.queryPermission) {
    return false;
  }
  try {
    const current = await handle.queryPermission({ mode: "read" });
    if (current === "granted") {
      return true;
    }
    if (!handle.requestPermission) {
      return false;
    }
    const next = await handle.requestPermission({ mode: "read" });
    return next === "granted";
  } catch {
    return false;
  }
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
  const fingerprint = await fingerprintPdf(bytes);
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
