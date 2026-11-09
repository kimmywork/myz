/**
 * Shared reader "source" helpers. The PDF and EPUB readers identify a document
 * the same way — a web url or a synthetic source key built from a local file
 * fingerprint — and run the same File System Access capability/permission
 * dance. This factory parameterises those bits so each reader only supplies its
 * own ref shape, source key builder and handle lookup.
 */

import { SOURCE_TYPES } from "@myz/shared/types";
import {
  ensureReadPermission,
  fingerprintBytes,
  isPermissionError as isLocalFilePermissionError,
  localFilePermissionError,
  readHandle,
  supportsFileSystemAccess as supportsLocalFileSystemAccess,
  type FilePicker,
  type PermissionCapableHandle,
} from "./local-file.js";

export interface ReaderSourceOptions<Ref> {
  /** Source type recorded for local files (web refs always map to `WEB`). */
  type: SOURCE_TYPES;
  /** Builds the synthetic source key from a local fingerprint. */
  buildUrl: (fingerprint: string) => string;
  /** Returns the web url of a ref, or null when it is a local file. */
  webUrl: (ref: Ref) => string | null;
  /** Returns the local fingerprint of a ref, or null when it is a web url. */
  fingerprintOf: (ref: Ref) => string | null;
  /** Reads a stored File System Access handle for a fingerprint. */
  getFileHandle: <T = unknown>(key: string) => Promise<T | undefined>;
}

export interface ReaderSource<Ref> {
  sourceKeyOf(ref: Ref): string;
  sourceTypeOf(ref: Ref): SOURCE_TYPES;
  supportsFileSystemAccess(): boolean;
  localPermissionError(): Error;
  isPermissionError(err: unknown): boolean;
  ensurePermission(fingerprint: string): Promise<boolean>;
}

/**
 * Builds the source helpers shared by the PDF and EPUB readers: the synthetic
 * source key/type, File System Access capability checks and the permission
 * request used to re-open a stored local file from a user gesture.
 */
export function createReaderSource<Ref>(
  options: ReaderSourceOptions<Ref>,
): ReaderSource<Ref> {
  function sourceKeyOf(ref: Ref): string {
    const url = options.webUrl(ref);
    if (url) return url;
    return options.buildUrl(options.fingerprintOf(ref) ?? "");
  }

  function sourceTypeOf(ref: Ref): SOURCE_TYPES {
    return options.webUrl(ref) ? SOURCE_TYPES.WEB : options.type;
  }

  function supportsFileSystemAccess(): boolean {
    return supportsLocalFileSystemAccess();
  }

  function localPermissionError(): Error {
    return localFilePermissionError();
  }

  function isPermissionError(err: unknown): boolean {
    return isLocalFilePermissionError(err);
  }

  async function ensurePermission(fingerprint: string): Promise<boolean> {
    const handle =
      await options.getFileHandle<PermissionCapableHandle>(fingerprint);
    if (!handle) return false;
    return ensureReadPermission(handle);
  }

  return {
    sourceKeyOf,
    sourceTypeOf,
    supportsFileSystemAccess,
    localPermissionError,
    isPermissionError,
    ensurePermission,
  };
}

export interface LocalFileSourceOptions<Ref> {
  /** Human label shown by the native file picker. */
  description: string;
  /** Mime → extension map for the native file picker. */
  accept: Record<string, string[]>;
  /** Fallback title when the handle has no name. */
  defaultTitle: string;
  /** Reads a stored handle for a fingerprint. */
  getFileHandle: (key: string) => Promise<PermissionCapableHandle | undefined>;
  /** Persists a picked handle under its fingerprint. */
  putFileHandle: (
    key: string,
    handle: PermissionCapableHandle,
  ) => Promise<void>;
  /** Maps a fingerprint + file name to the reader's local source ref. */
  makeRef: (fingerprint: string, title: string) => Ref;
}

export interface LocalFileSource<Ref> {
  pickLocal(): Promise<{ ref: Ref; bytes: ArrayBuffer } | null>;
  restoreLocal(
    fingerprint: string,
    title?: string,
  ): Promise<{ ref: Ref; bytes: ArrayBuffer } | null>;
}

/**
 * Shared "open a local file" flow for the PDF and EPUB readers: show the native
 * picker, read + fingerprint the bytes, persist the handle, and rebuild the ref.
 * Re-opening a stored file only needs the fingerprint and an optional title.
 */
export function createLocalFileSource<Ref>(
  options: LocalFileSourceOptions<Ref>,
): LocalFileSource<Ref> {
  const { description, accept, defaultTitle, getFileHandle, putFileHandle } =
    options;

  async function pickLocal(): Promise<{
    ref: Ref;
    bytes: ArrayBuffer;
  } | null> {
    const picker = (window as unknown as { showOpenFilePicker?: FilePicker })
      .showOpenFilePicker;
    if (!picker) {
      throw new Error("当前浏览器不支持打开本地文件");
    }
    const [handle] = await picker({
      types: [{ description, accept }],
    });
    if (!handle) {
      return null;
    }
    const bytes = await readHandle(handle);
    const fingerprint = await fingerprintBytes(bytes);
    await putFileHandle(fingerprint.hash, handle);
    return {
      ref: options.makeRef(fingerprint.hash, handle.name || defaultTitle),
      bytes,
    };
  }

  async function restoreLocal(
    fingerprint: string,
    title?: string,
  ): Promise<{ ref: Ref; bytes: ArrayBuffer } | null> {
    const handle = await getFileHandle(fingerprint);
    if (!handle) {
      return null;
    }
    const bytes = await readHandle(handle);
    return {
      ref: options.makeRef(fingerprint, title || handle.name || defaultTitle),
      bytes,
    };
  }

  return { pickLocal, restoreLocal };
}
