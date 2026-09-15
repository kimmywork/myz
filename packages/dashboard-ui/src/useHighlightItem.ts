import {
  Bookmark,
  FileText,
  Highlighter,
} from "@lucide/vue"
import { type MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared"
import { computed, ref } from "vue"
import type { PropType } from "vue"
import type { HighlightItemAction } from "./highlightMeta"

const KIND_ICON: Record<string, typeof Bookmark> = {
  [RECORD_KINDS.BOOKMARK]: Bookmark,
  [RECORD_KINDS.HIGHLIGHT]: Highlighter,
  [RECORD_KINDS.CLIP]: FileText,
}

interface HighlightItemProps {
  record?: MyZRecord
  formatInline?: (value: string) => string
  formatDateTime?: (value: string) => string
  renderHighlight?: (record: MyZRecord) => string
  formatNote?: (value: string) => string
  onAction?: (action: HighlightItemAction, record: MyZRecord) => void
}

export const highlightItemProps = {
  record: {
    type: Object as PropType<MyZRecord>,
    required: true,
  },
  formatInline: {
    type: Function as PropType<(value: string) => string>,
    required: true,
  },
  formatDateTime: {
    type: Function as PropType<(value: string) => string>,
    required: true,
  },
  renderHighlight: {
    type: Function as PropType<(record: MyZRecord) => string>,
    required: true,
  },
  formatNote: {
    type: Function as PropType<(value: string) => string>,
    required: true,
  },
  onAction: Function as PropType<(action: HighlightItemAction, record: MyZRecord) => void>,
}

export function useHighlightItem(props: HighlightItemProps) {
  const record = () => props.record!
  const kind = computed(() => getRecordKind(record()))
  const tags = computed(() => record().tags || [])
  const showAllTags = ref(false)
  const maxVisibleTags = 5

  const visibleTags = computed(() =>
    showAllTags.value ? tags.value : tags.value.slice(0, maxVisibleTags),
  )
  const hiddenTagsCount = computed(() =>
    Math.max(0, tags.value.length - maxVisibleTags),
  )

  const kindIcon = KIND_ICON[kind.value] || Highlighter
  const sourceLabel = computed(() => {
    const source = record().hostname || record().url || ""
    return `${source.substring(0, 20)}${source.length > 20 ? "..." : ""}`
  })
  const sourceTitle = computed(() => record().hostname || record().url || "")

  const isPdf = computed(() => Boolean(record().pdfLocator))
  const pageLabel = computed(() => {
    const pageNumber = record().pdfLocator?.pageNumber
    return pageNumber ? `第 ${pageNumber} 页` : ""
  })

  return {
    kind,
    visibleTags,
    hiddenTagsCount,
    showAllTags,
    kindIcon,
    sourceLabel,
    sourceTitle,
    isPdf,
    pageLabel,
    isClip: computed(() => kind.value === RECORD_KINDS.CLIP),
    isHighlight: computed(() => kind.value === RECORD_KINDS.HIGHLIGHT),
  }
}
