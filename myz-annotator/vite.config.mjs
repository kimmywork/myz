import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { crx } from "@crxjs/vite-plugin";
import zip from "vite-plugin-zip-pack";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    vueJsx(),
    crx({ manifest }),
    zip({
      outDir: "release",
      outFileName: `crx-myz-annotator-${manifest.version}.zip`,
      filter: (filePath) =>
        !filePath.endsWith(".map") && !filePath.includes(".vite") && !filePath.endsWith(".wasm"),
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome110",
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "src/popup/popup.html"),
        dashboard: resolve(rootDir, "src/dashboard/index.html"),
        offscreen: resolve(rootDir, "src/offscreen/code-execution.html"),
        sandbox: resolve(rootDir, "src/sandbox/code-execution.html"),
      },
    },
  },
});
