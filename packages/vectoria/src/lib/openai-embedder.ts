import OpenAI from "openai"
import type { EmbeddingModel, OpenAIEmbedderConfig } from "../types"

/**
 * OpenAI embedding model using the official SDK.
 * Includes caching to avoid redundant API calls.
 */
export class OpenAIEmbedder implements EmbeddingModel {
  private client: OpenAI
  private modelName: string
  private dimensions?: number
  private cache: Map<string, number[]> = new Map()

  constructor(config: OpenAIEmbedderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.endpoint || "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    })
    this.modelName = config.modelName || "text-embedding-3-small"
    this.dimensions = config.dimensions
  }

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text)
    if (cached) return cached

    const embeddings = await this.embedBatch([text])
    return embeddings[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Filter out already cached texts
    const toEmbed: { index: number; text: string }[] = []
    const results: number[][] = new Array(texts.length)

    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i])
      if (cached) {
        results[i] = cached
      } else {
        toEmbed.push({ index: i, text: texts[i] })
      }
    }

    if (toEmbed.length > 0) {
      const params: OpenAI.EmbeddingCreateParams = {
        input: toEmbed.map((t) => t.text),
        model: this.modelName,
      }
      if (this.dimensions) {
        params.dimensions = this.dimensions
      }

      const response = await this.client.embeddings.create(params)

      // Map results back and cache
      for (let i = 0; i < toEmbed.length; i++) {
        const embedding = response.data[i].embedding
        results[toEmbed[i].index] = embedding
        this.cache.set(toEmbed[i].text, embedding)
      }
    }

    return results
  }

  /**
   * Clear the embedding cache.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number } {
    return { size: this.cache.size }
  }
}
