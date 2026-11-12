import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { ref } from "vue";
import { buildAssetRecords } from "./asset-records.js";
import { invoke } from "@/messaging/invoke.js";

/**
 * "存为记录" for captures (§I7): one record per capture, each carrying its
 * attachment reference plus the shared capture context.
 *
 * Records are created one call at a time through the existing
 * `myz:saveHighlight` handler — no new contract, and the same validation every
 * other record goes through.
 */
export function useAssetRecords(options: {
  onSaved: (count: number) => void;
  onPartial: (saved: number, failed: number) => void;
  clearSelection: (ids: readonly string[]) => void;
}) {
  const saving = ref(false);

  async function save(assets: readonly StagedAssetMeta[]): Promise<number> {
    if (!assets.length || saving.value) return 0;
    saving.value = true;
    try {
      const payloads = buildAssetRecords(assets);
      let saved = 0;
      let failed = 0;
      // Only clear what actually saved: a failed capture stays selected so the
      // user can retry just that one instead of re-saving the successes.
      const savedIds: string[] = [];
      for (let index = 0; index < payloads.length; index += 1) {
        try {
          await invoke("myz:saveHighlight", payloads[index]);
          saved += 1;
          savedIds.push(assets[index].id);
        } catch (error) {
          console.warn("Failed to save capture as a record", error);
          failed += 1;
        }
      }
      if (failed) options.onPartial(saved, failed);
      else if (saved) options.onSaved(saved);
      if (savedIds.length) options.clearSelection(savedIds);
      return saved;
    } finally {
      saving.value = false;
    }
  }

  return { saving, save };
}
