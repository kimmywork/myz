import vueJsx from "@vitejs/plugin-vue-jsx"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const currentDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  plugins: [vueJsx()],
  resolve: {
    alias: {
      "@myz/shared/recordDisplay": `${currentDir}../shared/src/recordDisplay.ts`,
      "@myz/shared": `${currentDir}../shared/src`,
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
})
