/**
 * Local EPUB reading progress + stored File System Access handles.
 *
 * The store is built from the shared reader progress factory
 * (`reader/progress-store.ts`); the exported names are kept so existing
 * importers (reader store, dashboard) keep working unchanged.
 */

import {
  epubProgressStore,
  type EpubProgress,
} from "../reader/progress-store.js";

export type { EpubProgress };

export const putFileHandle = epubProgressStore.putFileHandle;
export const getFileHandle = epubProgressStore.getFileHandle;
export const saveProgress = epubProgressStore.saveProgress;
export const getProgress = epubProgressStore.getProgress;
export const listProgress = epubProgressStore.listProgress;
