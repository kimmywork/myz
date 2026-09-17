#!/usr/bin/env node
/*
 * Tailwind mapping-key guard.
 *
 * The design-system mapping layer (`packages/shared/src/theme/tailwind.css`)
 * must only introduce new theme keys. Reusing a key Tailwind already defines
 * (for example `--radius-md` or `--text-sm`) would silently change every
 * existing utility that reads it.
 *
 * Run with `npm run check:tailwind-keys`.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const MAPPING_PATH = resolve(root, "packages/shared/src/theme/tailwind.css")
const TAILWIND_THEME_PATH = resolve(root, "node_modules/tailwindcss/theme.css")

function collectKeys(source) {
  const keys = new Set()
  const re = /(--[a-z0-9-]+)\s*:/g
  let match
  while ((match = re.exec(source))) keys.add(match[1])
  return keys
}

const mappingSource = readFileSync(MAPPING_PATH, "utf8")
const themeBlock = mappingSource.match(/@theme(?:\s+inline)?\s*\{([\s\S]*?)\n\}/)
if (!themeBlock) {
  console.error("✗ could not find an @theme block in the mapping layer")
  process.exit(1)
}

const mappingKeys = collectKeys(themeBlock[1])
const tailwindKeys = collectKeys(readFileSync(TAILWIND_THEME_PATH, "utf8"))

const collisions = [...mappingKeys].filter((key) => tailwindKeys.has(key))

if (collisions.length > 0) {
  console.error(
    `✗ mapping layer redefines Tailwind default keys (${collisions.length}):`,
  )
  for (const key of collisions) console.error(`  - ${key}`)
  process.exit(1)
}

console.log(
  `✓ mapping introduces ${mappingKeys.size} new keys, no Tailwind collisions`,
)
