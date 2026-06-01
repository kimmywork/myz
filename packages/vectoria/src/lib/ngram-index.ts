/**
 * N-gram based inverted index for keyword matching.
 * Supports both English words and Chinese characters.
 */
export class NGramIndex {
  private index: Map<string, Set<string>> = new Map()
  private docTexts: Map<string, string> = new Map()
  private ngramSize: number

  constructor(ngramSize: number = 3) {
    this.ngramSize = ngramSize
  }

  /**
   * Add a document to the index.
   */
  addDocument(docId: string, text: string): void {
    this.docTexts.set(docId, text)
    const ngrams = this.generateNGrams(text)
    for (const ngram of ngrams) {
      if (!this.index.has(ngram)) {
        this.index.set(ngram, new Set())
      }
      this.index.get(ngram)!.add(docId)
    }
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(docId: string): void {
    const text = this.docTexts.get(docId)
    if (!text) return

    const ngrams = this.generateNGrams(text)
    for (const ngram of ngrams) {
      const docIds = this.index.get(ngram)
      if (docIds) {
        docIds.delete(docId)
        if (docIds.size === 0) {
          this.index.delete(ngram)
        }
      }
    }
    this.docTexts.delete(docId)
  }

  /**
   * Search for documents matching the query.
   * Returns a map of docId to match score (0-1).
   */
  search(query: string): Map<string, number> {
    const queryNGrams = this.generateNGrams(query)
    if (queryNGrams.length === 0) return new Map()

    const scores = new Map<string, number>()

    for (const ngram of queryNGrams) {
      const docIds = this.index.get(ngram)
      if (docIds) {
        for (const docId of docIds) {
          scores.set(docId, (scores.get(docId) || 0) + 1)
        }
      }
    }

    // Normalize scores by number of query n-grams
    for (const [docId, count] of scores) {
      scores.set(docId, count / queryNGrams.length)
    }

    return scores
  }

  /**
   * Generate n-grams from text.
   * Handles both English words and Chinese characters.
   */
  private generateNGrams(text: string): string[] {
    const normalized = text.toLowerCase().trim()
    const ngrams: string[] = []

    // Split into tokens (words and Chinese characters)
    const tokens = this.tokenize(normalized)

    // Generate word-level n-grams for English
    for (const token of tokens) {
      if (this.isChinese(token)) {
        // For Chinese characters, generate character-level n-grams
        for (let n = 2; n <= Math.min(this.ngramSize, token.length); n++) {
          for (let i = 0; i <= token.length - n; i++) {
            ngrams.push(token.slice(i, i + n))
          }
        }
        // Also add single characters
        for (const char of token) {
          ngrams.push(char)
        }
      } else {
        // For English words, add the whole word and character n-grams
        ngrams.push(token)
        if (token.length >= 3) {
          for (let i = 0; i <= token.length - 3; i++) {
            ngrams.push(token.slice(i, i + 3))
          }
        }
      }
    }

    return [...new Set(ngrams)] // Deduplicate
  }

  /**
   * Tokenize text into words and Chinese character sequences.
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = []
    let current = ""
    let isCurrentChinese = false

    for (const char of text) {
      const charIsChinese = this.isChinese(char)

      if (current === "") {
        current = char
        isCurrentChinese = charIsChinese
      } else if (charIsChinese === isCurrentChinese) {
        current += char
      } else {
        tokens.push(current)
        current = char
        isCurrentChinese = charIsChinese
      }
    }

    if (current) {
      tokens.push(current)
    }

    return tokens
  }

  /**
   * Check if a character is Chinese.
   */
  private isChinese(char: string): boolean {
    const code = char.charCodeAt(0)
    return code >= 0x4e00 && code <= 0x9fff
  }

  /**
   * Get index size statistics.
   */
  getStats(): { ngramCount: number; docCount: number } {
    return {
      ngramCount: this.index.size,
      docCount: this.docTexts.size,
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.index.clear()
    this.docTexts.clear()
  }
}
