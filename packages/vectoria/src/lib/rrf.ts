import type { RRFConfig, RankedResult } from "../types"

/**
 * Reciprocal Rank Fusion (RRF) for combining multiple ranked lists.
 * Paper: Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet and
 * individual Rank Learning Methods" (SIGIR 2009)
 */
export class RRFFuser {
  private k: number

  constructor(config: RRFConfig = {}) {
    this.k = config.k ?? 60
  }

  /**
   * Fuse multiple ranked lists using RRF.
   * @param rankedLists Array of ranked result lists
   * @returns Fused results sorted by RRF score descending
   */
  fuse(rankedLists: RankedResult[][]): Map<string, number> {
    const scores = new Map<string, number>()

    for (const rankedList of rankedLists) {
      for (let rank = 0; rank < rankedList.length; rank++) {
        const id = rankedList[rank].id
        const rrfScore = 1 / (this.k + rank + 1)
        scores.set(id, (scores.get(id) || 0) + rrfScore)
      }
    }

    return scores
  }

  /**
   * Fuse and return sorted results.
   */
  fuseAndSort(rankedLists: RankedResult[][]): RankedResult[] {
    const scores = this.fuse(rankedLists)

    const results: RankedResult[] = []
    for (const [id, score] of scores) {
      results.push({ id, score, rank: 0 })
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    // Assign ranks
    for (let i = 0; i < results.length; i++) {
      results[i].rank = i + 1
    }

    return results
  }

  /**
   * Normalize scores from different sources to comparable ranges.
   * @param results Results with raw scores
   * @returns Results with normalized scores (0-1)
   */
  normalizeScores(
    results: { id: string; score: number }[],
  ): { id: string; score: number }[] {
    if (results.length === 0) return []

    let min = Infinity
    let max = -Infinity
    for (const r of results) {
      if (r.score < min) min = r.score
      if (r.score > max) max = r.score
    }

    const range = max - min
    if (range === 0) {
      return results.map((r) => ({ ...r, score: 1 }))
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - min) / range,
    }))
  }
}
