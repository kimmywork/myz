import { SOURCE_TYPES } from "@myz/shared/types";
import { buildEpubSourceUrl } from "@myz/shared/url";
import type { ComputedRef, Ref } from "vue";
import type { EpubBook } from "../parse.js";
import type { EpubSourceRef } from "../source.js";
import { listProgress, saveProgress, type EpubProgress } from "../storage.js";

interface ProgressDeps {
  book: Ref<EpubBook | null>;
  sourceRef: Ref<EpubSourceRef | null>;
  spineIndex: Ref<number>;
  progression: Ref<number>;
  title: ComputedRef<string>;
  recents: Ref<EpubProgress[]>;
}

/** Recent-list loading and debounced progress persistence. */
export function createEpubProgress(deps: ProgressDeps) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function refreshRecents() {
    try {
      deps.recents.value = await listProgress();
    } catch {
      deps.recents.value = [];
    }
  }

  async function persistProgress() {
    const source = deps.sourceRef.value;
    if (!deps.book.value || !source) return;
    await saveProgress({
      sourceKey: buildEpubSourceUrl(source.fingerprint),
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: deps.spineIndex.value,
      progression: deps.progression.value,
      title: deps.title.value,
      fingerprint: source.fingerprint,
      updatedAt: new Date().toISOString(),
    });
    await refreshRecents();
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistProgress();
    }, 500);
  }

  return { refreshRecents, persistProgress, schedulePersist };
}

export type EpubProgressActions = ReturnType<typeof createEpubProgress>;
