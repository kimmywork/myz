/**
 * Shared helpers for opening and re-opening local files with the File System
 * Access API. Used by both the PDF and EPUB readers so the permission dance,
 * fingerprinting and picker plumbing stay in one place.
 */

export interface PermissionCapableHandle {
  name?: string;
  queryPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<"granted" | "denied" | "prompt">;
  getFile(): Promise<File>;
}

export type FilePicker = (
  options: unknown,
) => Promise<PermissionCapableHandle[]>;

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
export function localFilePermissionError(): Error {
  const err = new Error("需要重新授权访问该本地文件，请点击「重新授权并打开」");
  err.name = "LocalFilePermissionError";
  return err;
}

export function isPermissionError(err: unknown): boolean {
  return err instanceof Error && err.name === "LocalFilePermissionError";
}

export async function readHandle(
  handle: PermissionCapableHandle,
): Promise<ArrayBuffer> {
  if (handle.queryPermission) {
    const current = await handle.queryPermission({ mode: "read" });
    if (current !== "granted") {
      if (!handle.requestPermission) {
        throw localFilePermissionError();
      }
      try {
        const next = await handle.requestPermission({ mode: "read" });
        if (next !== "granted") {
          throw localFilePermissionError();
        }
      } catch (err) {
        // Browsers reject requestPermission without user activation; surface a
        // recoverable error instead of the raw DOMException.
        throw isPermissionError(err) ? err : localFilePermissionError();
      }
    }
  }
  const file = await handle.getFile();
  return file.arrayBuffer();
}

/** Returns whether read permission is (or can be) granted for a handle. */
export async function ensureReadPermission(
  handle: PermissionCapableHandle,
): Promise<boolean> {
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

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface FileFingerprint {
  size: number;
  sampleBytes: number;
  hash: string;
}

/**
 * Content fingerprint based on size plus the first and last `sampleSize`
 * bytes. Avoids hashing the whole file while still distinguishing documents.
 *
 * Important: must be computed **before** the bytes are handed to a parser that
 * may detach the ArrayBuffer.
 */
export async function fingerprintBytes(
  bytes: ArrayBuffer,
  sampleSize = 65536,
): Promise<FileFingerprint> {
  const u8 = new Uint8Array(bytes);
  const size = u8.byteLength;
  const head = u8.slice(0, Math.min(sampleSize, size));
  const tail = u8.slice(Math.max(0, size - sampleSize));
  const payload = new Uint8Array(8 + head.length + tail.length);
  new DataView(payload.buffer).setFloat64(0, size);
  payload.set(head, 8);
  payload.set(tail, 8 + head.length);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return { size, sampleBytes: head.length + tail.length, hash: toHex(digest) };
}
