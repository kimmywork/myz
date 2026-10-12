/**
 * Local PDF reading progress + stored File System Access handles.
 *
 * The store is built from the shared reader progress factory
 * (`reader/progress-store.ts`); the exported names are kept so existing
 * importers (composables, dashboard) keep working unchanged.
 */

import {
  pdfProgressStore,
  type PdfProgress,
} from "../reader/progress-store.js";

export type { PdfProgress };

export const putFileHandle = pdfProgressStore.putFileHandle;
export const getFileHandle = pdfProgressStore.getFileHandle;
export const saveProgress = pdfProgressStore.saveProgress;
export const getProgress = pdfProgressStore.getProgress;
export const listProgress = pdfProgressStore.listProgress;
