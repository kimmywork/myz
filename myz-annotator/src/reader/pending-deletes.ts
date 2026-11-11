import type { MyZRecord } from "@myz/shared/types";
import { invoke } from "@/messaging/invoke";

/**
 * Drops records whose delete is still inside its undo window. Readers reload
 * on `records`/`sync` changes; without this a pending record would be painted
 * back and stay visible after the journal commits it.
 *
 * Only the pending layer is filtered: after an undo (or a failed commit) the
 * id leaves the journal and the record loads normally again.
 */
export async function withoutPendingDeletes(
  records: readonly MyZRecord[],
): Promise<MyZRecord[]> {
  if (!records.length) return [...records];
  try {
    const { ids } = await invoke("myz:listPendingDeletes");
    if (!ids.length) return [...records];
    const pending = new Set(ids);
    return records.filter((record) => !pending.has(record.id));
  } catch {
    // A failed lookup must not hide records; show them and let the next
    // refresh filter once the journal answers again.
    return [...records];
  }
}
