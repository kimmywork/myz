/**
 * Tag-based exact match index.
 * Provides fast lookup for documents by their tags.
 */
export class TagIndex {
  private tagToDocs: Map<string, Set<string>> = new Map()
  private docToTags: Map<string, Set<string>> = new Map()

  /**
   * Add a document with its tags.
   */
  addDocument(docId: string, tags: string[]): void {
    const normalizedTags = tags.map((t) => t.toLowerCase().trim())
    this.docToTags.set(docId, new Set(normalizedTags))

    for (const tag of normalizedTags) {
      if (!this.tagToDocs.has(tag)) {
        this.tagToDocs.set(tag, new Set())
      }
      this.tagToDocs.get(tag)!.add(docId)
    }
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(docId: string): void {
    const tags = this.docToTags.get(docId)
    if (!tags) return

    for (const tag of tags) {
      const docIds = this.tagToDocs.get(tag)
      if (docIds) {
        docIds.delete(docId)
        if (docIds.size === 0) {
          this.tagToDocs.delete(tag)
        }
      }
    }
    this.docToTags.delete(docId)
  }

  /**
   * Search for documents matching any of the query tags.
   * Returns a map of docId to match score (0-1).
   */
  search(queryTags: string[]): Map<string, number> {
    if (queryTags.length === 0) return new Map()

    const normalizedQuery = queryTags.map((t) => t.toLowerCase().trim())
    const scores = new Map<string, number>()

    for (const tag of normalizedQuery) {
      const docIds = this.tagToDocs.get(tag)
      if (docIds) {
        for (const docId of docIds) {
          scores.set(docId, (scores.get(docId) || 0) + 1)
        }
      }
    }

    // Normalize scores by number of query tags
    for (const [docId, count] of scores) {
      scores.set(docId, count / normalizedQuery.length)
    }

    return scores
  }

  /**
   * Extract tags from query text.
   * Looks for #tag patterns and common tag indicators.
   */
  extractTagsFromQuery(query: string): string[] {
    const tags: string[] = []

    // Match #tag patterns
    const hashtagPattern = /#(\w+)/g
    let match
    while ((match = hashtagPattern.exec(query)) !== null) {
      tags.push(match[1])
    }

    // Match tag: value patterns
    const tagPattern = /tag:\s*(\w+)/gi
    while ((match = tagPattern.exec(query)) !== null) {
      tags.push(match[1])
    }

    return [...new Set(tags)]
  }

  /**
   * Get tags for a document.
   */
  getDocTags(docId: string): string[] {
    const tags = this.docToTags.get(docId)
    return tags ? Array.from(tags) : []
  }

  /**
   * Get all unique tags.
   */
  getAllTags(): string[] {
    return Array.from(this.tagToDocs.keys())
  }

  /**
   * Get index size statistics.
   */
  getStats(): { tagCount: number; docCount: number } {
    return {
      tagCount: this.tagToDocs.size,
      docCount: this.docToTags.size,
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.tagToDocs.clear()
    this.docToTags.clear()
  }
}
