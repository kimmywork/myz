import type { BM25Config } from "../types"

interface BM25DocEntry {
  id: string
  terms: string[]
  length: number
  metadata?: Record<string, any>
}

/**
 * BM25 sparse index for keyword-based retrieval.
 * Supports English words and Chinese character bigrams.
 */
export class BM25Index {
  private k1: number
  private b: number
  private docs: Map<string, BM25DocEntry> = new Map()
  private invertedIndex: Map<string, Map<string, number>> = new Map() // term -> docId -> tf
  private docCount: number = 0
  private avgDocLength: number = 0
  private totalLength: number = 0

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.2
    this.b = config.b ?? 0.75
  }

  /**
   * Add a document to the index.
   */
  addDocument(
    docId: string,
    text: string,
    metadata?: Record<string, any>,
  ): void {
    // Remove if exists
    if (this.docs.has(docId)) {
      this.removeDocument(docId)
    }

    const terms = this.tokenize(text)
    const docEntry: BM25DocEntry = {
      id: docId,
      terms,
      length: terms.length,
      metadata,
    }

    this.docs.set(docId, docEntry)
    this.docCount++
    this.totalLength += terms.length
    this.avgDocLength = this.totalLength / this.docCount

    // Build inverted index
    const termFreqs = new Map<string, number>()
    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1)
    }

    for (const [term, tf] of termFreqs) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map())
      }
      this.invertedIndex.get(term)!.set(docId, tf)
    }
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(docId: string): void {
    const doc = this.docs.get(docId)
    if (!doc) return

    // Remove from inverted index
    for (const term of doc.terms) {
      const posting = this.invertedIndex.get(term)
      if (posting) {
        posting.delete(docId)
        if (posting.size === 0) {
          this.invertedIndex.delete(term)
        }
      }
    }

    this.docs.delete(docId)
    this.docCount--
    this.totalLength -= doc.length
    this.avgDocLength =
      this.docCount > 0 ? this.totalLength / this.docCount : 0
  }

  /**
   * Search for documents matching the query.
   * Returns results sorted by BM25 score descending.
   */
  search(query: string, topK: number = 10): { id: string; score: number }[] {
    const queryTerms = this.tokenize(query)
    if (queryTerms.length === 0) return []

    const scores = new Map<string, number>()

    for (const term of queryTerms) {
      const posting = this.invertedIndex.get(term)
      if (!posting) continue

      const df = posting.size
      const idf = Math.log(
        (this.docCount - df + 0.5) / (df + 0.5) + 1,
      )

      for (const [docId, tf] of posting) {
        const doc = this.docs.get(docId)!
        const docLen = doc.length

        // BM25 formula
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLength))

        const score = idf * tfNorm
        scores.set(docId, (scores.get(docId) || 0) + score)
      }
    }

    // Sort by score descending
    const results = Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    // Normalize scores to 0-1 range
    if (results.length > 0) {
      const maxScore = results[0].score
      if (maxScore > 0) {
        for (const r of results) {
          r.score /= maxScore
        }
      }
    }

    return results
  }

  /**
   * Tokenize text into terms.
   * Supports English words and Chinese character bigrams.
   */
  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase().trim()
    const terms: string[] = []

    // Split by whitespace and punctuation
    const segments = normalized.split(/[\s\p{P}]+/u).filter(Boolean)

    for (const segment of segments) {
      if (this.isChinese(segment)) {
        // Chinese: character bigrams + individual characters
        for (let i = 0; i < segment.length; i++) {
          terms.push(segment[i])
          if (i < segment.length - 1) {
            terms.push(segment.slice(i, i + 2))
          }
        }
      } else {
        // English: whole word + trigrams
        terms.push(segment)
        if (segment.length >= 3) {
          for (let i = 0; i <= segment.length - 3; i++) {
            terms.push(segment.slice(i, i + 3))
          }
        }
      }
    }

    return terms
  }

  private isChinese(text: string): boolean {
    for (const char of text) {
      const code = char.charCodeAt(0)
      if (code >= 0x4e00 && code <= 0x9fff) {
        return true
      }
    }
    return false
  }

  /**
   * Get index statistics.
   */
  getStats(): { docCount: number; termCount: number; avgDocLength: number } {
    return {
      docCount: this.docCount,
      termCount: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.docs.clear()
    this.invertedIndex.clear()
    this.docCount = 0
    this.totalLength = 0
    this.avgDocLength = 0
  }
}
