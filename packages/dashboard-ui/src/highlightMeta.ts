import { isRecord, type MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared"

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
    case RECORD_KINDS.AI_GENERATED:
      return "AI摘录"
    case RECORD_KINDS.TWEET_POST:
      return "推文"
    case RECORD_KINDS.TWEET_REPLY:
      return "回复"
    case RECORD_KINDS.TWEET_RETWEET:
      return "转推"
    case RECORD_KINDS.TWEET_FAVORITE:
      return "点赞推文"
    case RECORD_KINDS.TWEET_BOOKMARK:
      return "书签推文"
    case RECORD_KINDS.TOOT_POST:
      return "嘟文"
    case RECORD_KINDS.TOOT_REPLY:
      return "嘟文回复"
    case RECORD_KINDS.TOOT_BOOST:
      return "转嘟"
    case RECORD_KINDS.TOOT_FAVORITE:
      return "点赞嘟文"
    case RECORD_KINDS.TOOT_BOOKMARK:
      return "书签嘟文"
    default:
      return "划线标注"
  }
}

export function getSocialBadgeLabel(value: string) {
  if (value === RECORD_KINDS.TWEET_RETWEET) return "转推"
  if (value === RECORD_KINDS.TWEET_FAVORITE) return "点赞推文"
  if (value === RECORD_KINDS.TWEET_BOOKMARK) return "书签推文"
  if (value === RECORD_KINDS.TWEET_REPLY) return "回复"
  if (value === RECORD_KINDS.TOOT_BOOST) return "转嘟"
  if (value === RECORD_KINDS.TOOT_FAVORITE) return "点赞嘟文"
  if (value === RECORD_KINDS.TOOT_BOOKMARK) return "书签嘟文"
  if (value === RECORD_KINDS.TOOT_REPLY) return "回复"
  if (String(value).startsWith("toot:")) return "嘟文"
  return "推文"
}

export function getSocialKinds(record: MyZRecord) {
  const kind = getRecordKind(record)
  const value = String(kind)
  const isSocial = value.startsWith("tweet:") || value.startsWith("toot:")
  const legacy =
    isRecord(record) && Array.isArray(record.tweetKinds) ? record.tweetKinds : undefined
  const raw = record?.socialKinds || legacy
  if (Array.isArray(raw)) {
    const normalized = raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(
        (item): item is RECORD_KINDS =>
          Boolean(item) &&
          Object.values(RECORD_KINDS).includes(item as RECORD_KINDS),
      )
    if (normalized.length) {
      return normalized
    }
  }
  return isSocial ? [value as RECORD_KINDS] : []
}
