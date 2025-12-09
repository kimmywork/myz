import { pipeline, env } from '@xenova/transformers';
import { EmbeddingModel } from '../types';

// 配置 transformers.js 不使用本地文件系统（浏览器环境）
env.allowLocalModels = false;
env.useBrowserCache = true;

// 在 Service Worker 环境中配置
env.backends.onnx.wasm.numThreads = 1; // 必须单线程
env.backends.onnx.wasm.proxy = false;   // 禁用代理 Worker
env.backends.onnx.wasm.simd = true;     // 启用 SIMD 加速

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
