import { defineConfig } from "vite"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const entry = resolve(__dirname, "src/cli.ts")
const planningModePath = resolve(
  __dirname,
  "../myz-annotator/src/skills/builtin/planning-mode/SKILL.md",
)
const builtinSkills = {
  "planning-mode": {
    "SKILL.md": readFileSync(planningModePath, "utf-8"),
  },
}

export default defineConfig({
  define: {
    __MYZ_BOT_BUILTIN_SKILLS__: JSON.stringify(builtinSkills),
  },
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
