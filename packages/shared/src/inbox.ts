import { z } from "zod"

export const INBOX_STATUSES = [
  "pending",
  "snoozed",
  "kept",
  "archived",
] as const

export type InboxStatus = (typeof INBOX_STATUSES)[number]

/** Default when no `status:` record exists: treated as kept / never handled. */
export const DEFAULT_INBOX_STATUS: InboxStatus = "kept"

export const InboxStatusStateSchema = z.object({
  targetId: z.string().min(1),
  status: z.enum(INBOX_STATUSES),
  snoozedUntil: z.string().optional(),
  handledAt: z.string().optional(),
  changedAt: z.string(),
})

export const InboxMarkStateSchema = z.object({
  targetId: z.string().min(1),
  marked: z.boolean(),
  changedAt: z.string(),
})

export const InboxRelationStateSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  changedAt: z.string(),
})

export type InboxStatusState = z.infer<typeof InboxStatusStateSchema>
export type InboxMarkState = z.infer<typeof InboxMarkStateSchema>
export type InboxRelationState = z.infer<typeof InboxRelationStateSchema>

export function inboxStatusRecordId(targetId: string): string {
  return `status:${targetId}`
}

export function inboxMarkRecordId(targetId: string): string {
  return `mark:${targetId}`
}

/** Relations are per-edge records: existence means "related". */
export function inboxRelationRecordId(
  sourceId: string,
  targetId: string,
): string {
  return `rel:${encodeURIComponent(sourceId)}:${encodeURIComponent(targetId)}`
}

export function parseInboxRecordId(recordId: string):
  | { kind: "status" | "mark"; targetId: string }
  | { kind: "rel"; sourceId: string; targetId: string }
  | null {
  if (recordId.startsWith("status:")) {
    return { kind: "status", targetId: recordId.slice("status:".length) }
  }
  if (recordId.startsWith("mark:")) {
    return { kind: "mark", targetId: recordId.slice("mark:".length) }
  }
  if (recordId.startsWith("rel:")) {
    const parts = recordId.slice("rel:".length).split(":")
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    return {
      kind: "rel",
      sourceId: decodeURIComponent(parts[0]),
      targetId: decodeURIComponent(parts[1]),
    }
  }
  return null
}

export function resolveInboxStatus(
  state: InboxStatusState | null | undefined,
): InboxStatus {
  return state?.status ?? DEFAULT_INBOX_STATUS
}

export function isInboxPending(
  state: InboxStatusState | null | undefined,
  now: number = Date.now(),
): boolean {
  const status = resolveInboxStatus(state)
  if (status === "pending") return true
  if (status === "snoozed") {
    return Boolean(
      state?.snoozedUntil && Date.parse(state.snoozedUntil) <= now,
    )
  }
  return false
}
