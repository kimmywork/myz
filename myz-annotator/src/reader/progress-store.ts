/**
 * Shared reader progress persistence. The PDF and EPUB readers store the same
 * shape of record — a handled file plus a per-document reading position — so
 * this module owns the generic store factory and the cross-reader facade.
 *
 * Each reader keeps its own database (`myz_pdf_db` / `myz_epub_db`) but reuses
 * the same object-store layout and the cached connection from `@myz/shared/idb`,
 * which adds the `onclose`/`versionchange` handling the PDF store used to lack.
 */

import {
  idbGet,
  idbGetAll,
  idbPut,
  openDatabase,
  withStore,
} from "@myz/shared/idb";
import type { SOURCE_TYPES } from "@myz/shared/types";

/** Fields every reader's progress record carries. */
export interface ReaderProgressBase {
  sourceKey: string;
  sourceType: SOURCE_TYPES;
  updatedAt: string;
  [key: string]: unknown;
}

/** PDF progress: current page within a known page count. */
export interface PdfProgress extends ReaderProgressBase {
  page: number;
  pages: number;
  title?: string;
  url?: string;
  fingerprint?: string;
}

/** EPUB progress: spine index plus within-chapter progression ratio. */
export interface EpubProgress extends ReaderProgressBase {
  spineIndex: number;
  progression: number;
  title?: string;
  fingerprint?: string;
}

/** Any reader's progress record (discriminate with `isPdfProgress`). */
export type ReaderProgress = PdfProgress | EpubProgress;

/**
 * Narrows a merged progress entry to the PDF shape. Needed because the base
 * index signature means a plain `"page" in entry` check does not narrow.
 */
export function isPdfProgress(entry: ReaderProgress): entry is PdfProgress {
  return "page" in entry;
}

const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const PROGRESS_STORE = "progress";

/** Creates the handle + progress stores the first time a reader db is opened. */
function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(HANDLE_STORE)) {
    db.createObjectStore(HANDLE_STORE);
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
    db.createObjectStore(PROGRESS_STORE, { keyPath: "sourceKey" });
  }
}

export interface ProgressStore<P extends ReaderProgressBase> {
  /** Stores a File System Access handle under its fingerprint. */
  putFileHandle(key: string, handle: unknown): Promise<void>;
  /** Reads a stored File System Access handle, if any. */
  getFileHandle<T = unknown>(key: string): Promise<T | undefined>;
  /** Inserts or replaces a progress record. */
  saveProgress(progress: P): Promise<void>;
  /** Reads one progress record by source key. */
  getProgress(sourceKey: string): Promise<P | undefined>;
  /** Reads every progress record, newest first. */
  listProgress(): Promise<P[]>;
}

/**
 * Builds a reader progress store over a cached IndexedDB connection. Callers
 * re-export its methods so the reader-specific modules keep their old names.
 */
export function createProgressStore<P extends ReaderProgressBase>(
  dbName: string,
): ProgressStore<P> {
  const open = (): Promise<IDBDatabase> =>
    openDatabase({ name: dbName, version: DB_VERSION, upgrade: upgradeSchema });

  return {
    async putFileHandle(key, handle) {
      return withStore<void>(await open(), HANDLE_STORE, "readwrite", (store) =>
        store.put(handle, key),
      );
    },
    async getFileHandle<T = unknown>(key: string) {
      return withStore<T | undefined>(
        await open(),
        HANDLE_STORE,
        "readonly",
        (store) => store.get(key),
      );
    },
    async saveProgress(progress) {
      return idbPut(await open(), PROGRESS_STORE, progress);
    },
    async getProgress(sourceKey) {
      return idbGet<P>(await open(), PROGRESS_STORE, sourceKey);
    },
    async listProgress() {
      const all = await idbGetAll<P>(await open(), PROGRESS_STORE);
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}

/** PDF reader progress store (`myz_pdf_db`). */
export const pdfProgressStore = createProgressStore<PdfProgress>("myz_pdf_db");

/** EPUB reader progress store (`myz_epub_db`). */
export const epubProgressStore =
  createProgressStore<EpubProgress>("myz_epub_db");

/**
 * `reader-progress` facade: every reader's recent documents in one list, newest
 * first, so dashboard surfaces no longer import the PDF/EPUB storage modules.
 */
export const readerProgress = {
  async listProgress(): Promise<ReaderProgress[]> {
    const [pdf, epub] = await Promise.all([
      pdfProgressStore.listProgress().catch((): PdfProgress[] => []),
      epubProgressStore.listProgress().catch((): EpubProgress[] => []),
    ]);
    return [...pdf, ...epub].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  },
};

/** Convenience alias for `readerProgress.listProgress`. */
export function listReaderProgress(): Promise<ReaderProgress[]> {
  return readerProgress.listProgress();
}
