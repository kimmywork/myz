import OpenAI from "openai"
import type { EmbeddingModel, OpenAIEmbedderConfig } from "../types"

export class OpenAIEmbedder implements EmbeddingModel {
  private client: OpenAI
  private modelName: string

  constructor(config: OpenAIEmbedderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.endpoint || "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    })
    this.modelName = config.modelName || "text-embedding-3-small"
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text])
    return embeddings[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      input: texts,
      model: this.modelName,
    })

    // OpenAI returns embeddings in the same order as input
    return response.data.map((item) => item.embedding)
  }
}
