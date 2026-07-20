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

const target = process.env.TARGET !== "firefox" ? "chrome" : "firefox";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    vueJsx(),
    crx({ manifest, browser: target }),
    zip({
      inDir: target === "firefox" ? `dist-${target}` : "dist",
      outDir: "release",
      outFileName: `crx-myz-annotator-${manifest.version}-${target}.zip`,
      filter: (filePath) =>
        !filePath.endsWith(".map") &&
        !filePath.includes(".vite") &&
        !filePath.endsWith(".wasm"),
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
      "@myz/dashboard-core": resolve(rootDir, "../packages/dashboard-core/src"),
      "@myz/dashboard-ui": resolve(rootDir, "../packages/dashboard-ui/src"),
      "@myz/sync-core": resolve(rootDir, "../packages/sync-core/src"),
      "@myz/shared": resolve(rootDir, "../packages/shared/src"),
    },
  },
  build: {
    outDir: target === "firefox" ? `dist-${target}` : "dist",
    emptyOutDir: true,
    target: target === "firefox" ? "firefox110" : "chrome110",
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "src/popup/popup.html"),
        dashboard: resolve(rootDir, "src/dashboard/index.html"),
      },
    },
  },
});
