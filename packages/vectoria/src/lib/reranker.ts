import type { RerankerConfig, HybridSearchResult } from "../types"

/**
 * Multi-factor reranker for improving search result quality.
 *
 * Factors:
 * - Title match boost
 * - Length penalty (too short or too long)
 * - Recency boost (newer documents score higher)
 */
export class Reranker {
  private titleBoost: number
  private minLen: number
  private maxLen: number
  private lengthPenalty: number
  private recencyEnabled: boolean
  private halfLifeDays: number

  constructor(config: RerankerConfig = {}) {
    this.titleBoost = config.titleBoost ?? 2.0
    this.minLen = config.lengthPenalty?.minLen ?? 50
    this.maxLen = config.lengthPenalty?.maxLen ?? 500
    this.lengthPenalty = config.lengthPenalty?.penalty ?? 0.8
    this.recencyEnabled = config.recencyBoost?.enabled ?? true
    this.halfLifeDays = config.recencyBoost?.halfLifeDays ?? 30
  }

  /**
   * Rerank search results using multiple factors.
   */
  rerank(
    results: HybridSearchResult[],
    query: string,
  ): HybridSearchResult[] {
    const queryTerms = this.extractTerms(query)

    const reranked = results.map((result) => {
      let multiplier = 1.0

      // Title match boost
      const title = (result.doc.metadata?.title as string) || ""
      if (title && this.matchesTerms(title, queryTerms)) {
        multiplier *= this.titleBoost
      }

      // Length penalty
      const textLen = result.doc.text.length
      if (textLen < this.minLen || textLen > this.maxLen) {
        multiplier *= this.lengthPenalty
      }

      // Recency boost
      if (this.recencyEnabled && result.doc.createdAt) {
        const ageMs = Date.now() - result.doc.createdAt
        const ageDays = ageMs / (1000 * 60 * 60 * 24)
        // Exponential decay with half-life
        const recencyScore = Math.pow(0.5, ageDays / this.halfLifeDays)
        multiplier *= 0.5 + 0.5 * recencyScore
      }

      return {
        ...result,
        rerankerScore: result.rrfScore * multiplier,
        finalScore: result.rrfScore * multiplier,
      }
    })

    // Sort by final score descending
    reranked.sort((a, b) => b.finalScore - a.finalScore)

    return reranked
  }

  /**
   * Extract terms from text for matching.
   */
  private extractTerms(text: string): Set<string> {
    const terms = new Set<string>()
    const normalized = text.toLowerCase().trim()
    const words = normalized.split(/[\s\p{P}]+/u).filter(Boolean)
    for (const word of words) {
      terms.add(word)
      // Add bigrams
      if (word.length >= 2) {
        for (let i = 0; i < word.length - 1; i++) {
          terms.add(word.slice(i, i + 2))
        }
      }
    }
    return terms
  }

  /**
   * Check if text contains any of the query terms.
   */
  private matchesTerms(text: string, terms: Set<string>): boolean {
    const textLower = text.toLowerCase()
    for (const term of terms) {
      if (textLower.includes(term)) {
        return true
      }
    }
    return false
  }
}
