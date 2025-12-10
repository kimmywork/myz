import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  if (mode === 'docs') {
    return {
      base: './',
      build: {
        outDir: 'docs',
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'index.html'),
            demo: resolve(__dirname, 'demo.html'),
            perf: resolve(__dirname, 'perf-test.html'),
            sw: resolve(__dirname, 'ui/sw.ts')
          },
          output: {
            entryFileNames: (assetInfo) => {
              return assetInfo.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js';
            }
          }
        }
      },
      optimizeDeps: {
        exclude: ["@huggingface/transformers"],
      },
      server: {
        headers: {
          'Service-Worker-Allowed': '/',
        }
      }
    };
  }

  return {
    plugins: [
      dts({
        include: ['src'],
        rollupTypes: true
      })
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'Vectoria',
        fileName: 'vectoria',
      },
      rollupOptions: {
        external: [], 
      },
    },
    optimizeDeps: {
      exclude: ["@huggingface/transformers"],
    },
    server: {
      headers: {
        'Service-Worker-Allowed': '/',
      }
    }
  };
});
