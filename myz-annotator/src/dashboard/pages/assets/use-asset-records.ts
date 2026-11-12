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
      for (const payload of payloads) {
        try {
          await invoke("myz:saveHighlight", payload);
          saved += 1;
        } catch (error) {
          console.warn("Failed to save capture as a record", error);
          failed += 1;
        }
      }
      if (failed) options.onPartial(saved, failed);
      else if (saved) options.onSaved(saved);
      options.clearSelection(assets.map((asset) => asset.id));
      return saved;
    } finally {
      saving.value = false;
    }
  }

  return { saving, save };
}
