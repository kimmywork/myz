import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { crx } from "@crxjs/vite-plugin";
import zip from "vite-plugin-zip-pack";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const target = process.env.TARGET !== "firefox" ? "chrome" : "firefox";

const PDFJS_ASSET_DIRS = ["wasm", "cmaps", "standard_fonts", "iccs"];

/**
 * Copies pdf.js runtime assets (WASM codecs, CMaps, standard fonts, ICC
 * profiles) into the extension build so image-heavy PDFs (JPEG2000/JBIG2)
 * and CJK documents can be decoded at runtime.
 */
function copyPdfjsAssets() {
  let outDir = "dist";
  return {
    name: "myz-copy-pdfjs-assets",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const source = resolve(rootDir, "../node_modules/pdfjs-dist");
      const dest = resolve(rootDir, outDir, "assets/pdfjs");
      mkdirSync(dest, { recursive: true });
      for (const dir of PDFJS_ASSET_DIRS) {
        const from = resolve(source, dir);
        if (existsSync(from)) {
          cpSync(from, resolve(dest, dir), { recursive: true });
        }
      }
    },
  };
}

/**
 * @fontsource ships both woff2 and a legacy woff fallback for every CJK face.
 * Every target browser (Chrome 110+, Firefox 110+) supports woff2, so the
 * legacy files are pure payload. Strip them before Vite collects assets.
 */
function dropLegacyWoff() {
  return {
    name: "myz-drop-legacy-woff",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@fontsource/") || !id.endsWith(".css")) {
        return null;
      }
      const next = code.replace(
        /,\s*url\([^)]+\.woff\)\s*format\((['"])woff\1\)/g,
        "",
      );
      return next === code ? null : next;
    },
  };
}

export default defineConfig({
  plugins: [
    dropLegacyWoff(),
    tailwindcss(),
    vue(),
    vueJsx(),
    crx({ manifest, browser: target }),
    copyPdfjsAssets(),
    zip({
      inDir: target === "firefox" ? `dist-${target}` : "dist",
      outDir: "release",
      outFileName: `crx-myz-annotator-${manifest.version}-${target}.zip`,
      filter: (filePath) =>
        !filePath.endsWith(".map") && !filePath.includes(".vite"),
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
        "pdf-viewer": resolve(rootDir, "src/pdf/pdf-viewer.html"),
        "pdf-spike": resolve(rootDir, "src/pdf/spike.html"),
        "epub-viewer": resolve(rootDir, "src/epub/epub-viewer.html"),
      },
    },
  },
});
