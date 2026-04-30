import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const rootDir = fileURLToPath(new URL(".", import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), vueJsx(), tailwindcss()],
  resolve: {
    alias: {
      "@myz/ai-core": resolve(rootDir, "../packages/ai-core/src"),
      "@": resolve(rootDir, "src"),
      "@myz/dashboard-core": resolve(rootDir, "../packages/dashboard-core/src"),
      "@myz/dashboard-ui": resolve(rootDir, "../packages/dashboard-ui/src"),
      "@myz/notes-workspace": resolve(rootDir, "../packages/notes-workspace/src"),
      "@myz/shared": resolve(rootDir, "../packages/shared/src"),
      "@myz/sync-core": resolve(rootDir, "../packages/sync-core/src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
