import { type MyZRecord, RECORD_KINDS } from "@myz/shared"

export type HighlightItemAction =
  | "copy"
  | "view"
  | "edit"
  | "delete"
  | "downgrade"
  | "openPdf"

export interface HighlightGroupSection {
  date: string
  detailText?: string
  stats: {
    total: number
  }
  items: MyZRecord[]
}

export function getKindLabel(kind: RECORD_KINDS) {
  switch (kind) {
    case RECORD_KINDS.CLIP:
      return "摘录"
    case RECORD_KINDS.BOOKMARK:
      return "来源"
    default:
      return "划线"
  }
}
