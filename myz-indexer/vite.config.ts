import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      rollupTypes: true
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyZIndexer',
      fileName: 'myz-indexer',
    },
    rollupOptions: {
      // 确保外部化处理那些你不想打包进库的依赖
      external: [], 
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  server: {
    headers: {
      // 移除 COOP/COEP headers 以禁用 SharedArrayBuffer
      // 这将强制 ONNX Runtime 回退到单线程模式，避免在 Service Worker 中调用 Atomics.wait
      'Service-Worker-Allowed': '/',
    }
  }
});
