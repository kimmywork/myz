import { type MyZRecord, RECORD_KINDS } from "@myz/shared"
import { recordKindLabel } from "@myz/shared/recordDisplay"

export type HighlightItemAction =
  | "copy"
  | "view"
  | "edit"
  | "delete"
  | "downgrade"
  | "openPdf"
  | "openEpub"

export interface HighlightGroupSection {
  date: string
  detailText?: string
  stats: {
    total: number
  }
  items: MyZRecord[]
}

export function getKindLabel(kind: RECORD_KINDS) {
  return recordKindLabel(kind)
}
