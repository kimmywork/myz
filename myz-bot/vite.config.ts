import { defineConfig } from "vite"
import { resolve } from "node:path"

const entry = resolve(__dirname, "src/cli.ts")

export default defineConfig({
  build: {
    ssr: entry,
    target: "node18",
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: "cjs",
        entryFileNames: "myz-bot.cjs",
        inlineDynamicImports: true,
        banner: "#!/usr/bin/env node",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
})
