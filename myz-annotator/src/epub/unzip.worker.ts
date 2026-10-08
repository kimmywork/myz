import { unzipSync } from "fflate";

interface UnzipRequest {
  id: number;
  bytes: ArrayBuffer;
}

interface UnzipSuccess {
  id: number;
  ok: true;
  files: Array<[string, Uint8Array<ArrayBuffer>]>;
}

interface UnzipFailure {
  id: number;
  ok: false;
  error: string;
}

/**
 * Decompresses an entire EPUB archive off the main thread. The whole archive is
 * still materialized in memory (the reader model needs every resource), but the
 * heavy synchronous inflate work no longer freezes the UI while a large book
 * opens.
 */
self.onmessage = (event: MessageEvent<UnzipRequest>) => {
  const { id, bytes } = event.data;
  try {
    const raw = unzipSync(new Uint8Array(bytes));
    const files = Object.entries(raw) as Array<
      [string, Uint8Array<ArrayBuffer>]
    >;
    const transfers = files.map(([, data]) => data.buffer);
    const message: UnzipSuccess = { id, ok: true, files };
    (self as unknown as Worker).postMessage(message, transfers);
  } catch (err) {
    const message: UnzipFailure = {
      id,
      ok: false,
      error: (err as Error).message || "解压失败",
    };
    (self as unknown as Worker).postMessage(message);
  }
};
