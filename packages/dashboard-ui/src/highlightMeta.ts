import { type MyZRecord, RECORD_KINDS } from "@myz/shared"

export type HighlightItemAction = "copy" | "view" | "edit" | "delete" | "downgrade"

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
      return "保存文字"
    case RECORD_KINDS.BOOKMARK:
      return "网页书签"
    default:
      return "划线标注"
  }
}
