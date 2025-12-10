import { pipeline } from '@huggingface/transformers';
import { EmbeddingModel } from '../types';

export class TransformersEmbedder implements EmbeddingModel {
  private pipe: any = null;
  private modelName: string;

  constructor(modelName: string = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2') {
    this.modelName = modelName;
  }

  async init() {
    if (!this.pipe) {
      console.log(`Loading model ${this.modelName}...`);
      this.pipe = await pipeline('feature-extraction', this.modelName);
      console.log('Model loaded.');
    }
  }

  async embed(text: string): Promise<number[]> {
    await this.init();
    const output = await this.pipe(text, { pooling: 'mean', normalize: true });
    // Convert Tensor to regular array
    return Array.from(output.data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.init();
    const output = await this.pipe(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  }
}
