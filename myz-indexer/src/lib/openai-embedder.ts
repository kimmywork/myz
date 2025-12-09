import { EmbeddingModel } from '../types';

export interface OpenAIConfig {
  apiKey: string;
  endpoint?: string; // Defaults to https://api.openai.com/v1
  modelName?: string; // Defaults to text-embedding-3-small
}

export class OpenAIEmbedder implements EmbeddingModel {
  private apiKey: string;
  private endpoint: string;
  private modelName: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'https://api.openai.com/v1';
    this.modelName = config.modelName || 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI has a limit on batch size (usually 2048), but let's assume reasonable chunks
    // We should handle basic error checking
    
    const url = `${this.endpoint}/embeddings`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          input: texts,
          model: this.modelName
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API Error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      
      // OpenAI returns { data: [ { embedding: [...] }, ... ] }
      // We need to ensure the order matches the input
      // The API guarantees order matches input array
      return data.data.map((item: any) => item.embedding);
      
    } catch (error) {
      console.error('Embedding fetch failed:', error);
      throw error;
    }
  }
}
