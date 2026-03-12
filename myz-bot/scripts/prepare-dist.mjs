import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const distDir = resolve(root, "dist")
const pkgPath = resolve(root, "package.json")
const readmePath = resolve(root, "README.md")

mkdirSync(distDir, { recursive: true })

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description || "",
  license: pkg.license || "UNLICENSED",
  type: "commonjs",
  bin: {
    "myz-bot": "myz-bot.cjs",
  },
}

writeFileSync(
  resolve(distDir, "package.json"),
  JSON.stringify(distPkg, null, 2) + "\n",
)

if (existsSync(readmePath)) {
  copyFileSync(readmePath, resolve(distDir, "README.md"))
}
