import { upsertDeletion } from "./storage";
import { recordIdForConversation, recordIdForHighlight } from "./records";

export async function recordHighlightDeletion(id: string): Promise<void> {
  const recordId = recordIdForHighlight(id);
  await upsertDeletion({ recordId, deletedAt: new Date().toISOString() });
}

export async function recordConversationDeletion(id: string): Promise<void> {
  const recordId = recordIdForConversation(id);
  await upsertDeletion({ recordId, deletedAt: new Date().toISOString() });
}
