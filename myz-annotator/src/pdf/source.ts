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

async function readHandle(
  handle: PermissionCapableHandle,
): Promise<ArrayBuffer> {
  if (handle.queryPermission) {
    const current = await handle.queryPermission({ mode: "read" });
    if (current !== "granted" && handle.requestPermission) {
      const next = await handle.requestPermission({ mode: "read" });
      if (next !== "granted") {
        throw new Error("未获得读取该文件的权限");
      }
    }
  }
  const file = await handle.getFile();
  return file.arrayBuffer();
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
