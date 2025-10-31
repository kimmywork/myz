import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { crx } from "@crxjs/vite-plugin";
import zip from "vite-plugin-zip-pack";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    crx({ manifest }),
    zip({
      outDir: "release",
      outFileName: `crx-myz-annotator-${manifest.version}.zip`,
      filter: (filePath) => !filePath.endsWith(".map"),
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome110",
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "src/popup/popup.html"),
        dashboard: resolve(rootDir, "src/dashboard/index.html"),
      },
    },
  },
});
