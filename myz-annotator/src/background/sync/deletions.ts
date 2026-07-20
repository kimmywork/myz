import { recordIdForHighlight } from "./records";
import { upsertDeletion } from "./storage";

export async function recordHighlightDeletion(id: string): Promise<void> {
  const recordId = recordIdForHighlight(id);
  await upsertDeletion({ recordId, deletedAt: new Date().toISOString() });
}
