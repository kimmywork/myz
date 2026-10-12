import { SOURCE_TYPES } from "@myz/shared/types";
import { buildEpubSourceUrl } from "@myz/shared/url";
import {
  fingerprintBytes,
  readHandle,
  type FilePicker,
  type PermissionCapableHandle,
} from "../reader/local-file.js";
import { createReaderSource } from "../reader/source.js";
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

export async function pickLocalEpub(): Promise<{
  ref: EpubSourceRef;
  bytes: ArrayBuffer;
} | null> {
  const picker = (window as unknown as { showOpenFilePicker?: FilePicker })
    .showOpenFilePicker;
  if (!picker) {
    throw new Error("当前浏览器不支持打开本地文件");
  }
  const [handle] = await picker({
    types: [
      {
        description: "EPUB",
        accept: { "application/epub+zip": [".epub"] },
      },
    ],
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
      title: handle.name || "本地 EPUB",
    },
    bytes,
  };
}

export async function restoreLocalEpub(
  fingerprint: string,
  title?: string,
): Promise<{ ref: EpubSourceRef; bytes: ArrayBuffer } | null> {
  const handle = await getFileHandle<PermissionCapableHandle>(fingerprint);
  if (!handle) {
    return null;
  }
  const bytes = await readHandle(handle);
  return {
    ref: {
      kind: "local",
      fingerprint,
      title: title || handle.name || "本地 EPUB",
    },
    bytes,
  };
}
