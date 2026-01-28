import { pipeline, env } from '@huggingface/transformers';
import { EmbeddingModel } from '../types';

export class TransformersEmbedder implements EmbeddingModel {
  private pipe: any = null;
  private modelName: string;
  private device: 'auto' | 'webgpu' | 'wasm';
  private wasmPaths?: string | Record<string, string>;

  constructor(modelName: string = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', device: 'auto' | 'webgpu' | 'wasm' = 'wasm', wasmPaths?: string | Record<string, string>) {
    this.modelName = modelName;
    this.device = device;
    this.wasmPaths = wasmPaths;
  }

  async init() {
    if (!this.pipe) {
      if (this.wasmPaths) {
        // Configure WASM paths if provided
        // @ts-ignore - env type definition might be incomplete
        env.backends.onnx = {
          wasm: {
            wasmPaths: this.wasmPaths
          }
        }
      }

      console.log(`Loading model ${this.modelName} on ${this.device}...`);
      this.pipe = await pipeline('feature-extraction', this.modelName, { device: this.device });
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
