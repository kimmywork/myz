import type { KnowledgeLayer } from "./types"
import type { MyZRecord } from "./recordsAdapter"

export interface ClassificationResult {
  layer: KnowledgeLayer
  confidence: number
  reason: string
}

const CONCEPTUAL_KEYWORDS = [
  "概念", "原理", "理论", "思想", "哲学", "原则", "信念", "价值观",
  "concept", "principle", "theory", "philosophy", "belief", "value",
]

const STRUCTURAL_KEYWORDS = [
  "架构", "结构", "模式", "设计", "依赖", "组件", "模块", "系统",
  "architecture", "structure", "pattern", "design", "dependency", "component",
]

const BEHAVIORAL_KEYWORDS = [
  "偏好", "习惯", "风格", "流程", "工作流", "实践", "方法",
  "preference", "habit", "style", "workflow", "practice", "method",
]

function hasKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

export function classifyRecord(record: MyZRecord): ClassificationResult {
  const text = [record.text, record.note, record.title].filter(Boolean).join(" ")

  if (record.kind === "bookmark") {
    return { layer: "structure", confidence: 0.7, reason: "bookmark 类型默认归入 structure" }
  }

  if (record.kind === "clip") {
    if (hasKeywords(text, CONCEPTUAL_KEYWORDS)) {
      return { layer: "concepts", confidence: 0.6, reason: "clip 内容包含概念性关键词" }
    }
    return { layer: "structure", confidence: 0.6, reason: "clip 类型默认归入 structure" }
  }

  if (record.kind === "ai-generated") {
    if (hasKeywords(text, BEHAVIORAL_KEYWORDS)) {
      return { layer: "behavior", confidence: 0.6, reason: "AI 生成内容包含行为性关键词" }
    }
    if (hasKeywords(text, CONCEPTUAL_KEYWORDS)) {
      return { layer: "concepts", confidence: 0.6, reason: "AI 生成内容包含概念性关键词" }
    }
    return { layer: "ops", confidence: 0.5, reason: "AI 生成内容默认归入 ops" }
  }

  if (record.kind === "highlight") {
    const tags = (record.tags || []).map((t) => t.toLowerCase())
    if (tags.includes("conceptual") || hasKeywords(text, CONCEPTUAL_KEYWORDS)) {
      return { layer: "concepts", confidence: 0.8, reason: "highlight 标记为 conceptual 或包含概念性关键词" }
    }
    if (tags.includes("structural") || hasKeywords(text, STRUCTURAL_KEYWORDS)) {
      return { layer: "structure", confidence: 0.8, reason: "highlight 标记为 structural 或包含结构性关键词" }
    }
    if (tags.includes("behavioural") || tags.includes("behavioral") || hasKeywords(text, BEHAVIORAL_KEYWORDS)) {
      return { layer: "behavior", confidence: 0.8, reason: "highlight 标记为 behavioural 或包含行为性关键词" }
    }
    return { layer: "concepts", confidence: 0.5, reason: "highlight 默认归入 concepts" }
  }

  if (hasKeywords(text, CONCEPTUAL_KEYWORDS)) {
    return { layer: "concepts", confidence: 0.5, reason: "内容包含概念性关键词" }
  }
  if (hasKeywords(text, STRUCTURAL_KEYWORDS)) {
    return { layer: "structure", confidence: 0.5, reason: "内容包含结构性关键词" }
  }
  if (hasKeywords(text, BEHAVIORAL_KEYWORDS)) {
    return { layer: "behavior", confidence: 0.5, reason: "内容包含行为性关键词" }
  }

  return { layer: "ops", confidence: 0.4, reason: "无法明确分类，默认归入 ops" }
}
