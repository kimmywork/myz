import type { MyZRecord } from "@myz/shared/types";
import type { StreamDataset } from "@myz/sync-core/accountSync";
import {
  deleteHighlight,
  getAllHighlights,
  saveHighlight,
} from "../../storage";
import { parseRecordId, recordIdForHighlight } from "../records";

/** The main highlight stream dataset (recordId `h:<id>`). */
export function createHighlightDataset(): StreamDataset {
  return {
    streamId: "highlights",
    async collect() {
      const highlights = await getAllHighlights();
      return highlights.map((highlight) => ({
        recordId: recordIdForHighlight(highlight.id),
        updatedAt: highlight.updatedAt || highlight.createdAt,
        data: highlight,
      }));
    },
    async apply(record) {
      const data = record.data as MyZRecord;
      await saveHighlight({ ...data, updatedAt: record.updatedAt });
    },
    async remove(recordId) {
      const parsed = parseRecordId(recordId);
      if (parsed?.type === "highlight") {
        await deleteHighlight(parsed.id);
      }
    },
  };
}
