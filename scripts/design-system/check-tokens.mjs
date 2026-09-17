#!/usr/bin/env node
/*
 * Design-token drift check.
 *
 * Asserts that the single source of truth (`packages/shared/src/theme/tokens.css`)
 * and the written specification (`docs/research/design-system/design-system.md`)
 * agree on both token names and hex values, in both directions.
 *
 * Run with `npm run check:design-tokens`.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const CSS_PATH = resolve(root, "packages/shared/src/theme/tokens.css")
const MD_PATH = resolve(root, "docs/research/design-system/design-system.md")

const TOKEN_RE = /--myz-[a-z0-9-]+/g
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function hexesIn(text) {
  const matches = text.match(HEX_RE) ?? []
  return matches.map((hex) => hex.toLowerCase())
}

/* ── Parse the CSS token file ─────────────────────────────────────── */
function parseCss(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const vars = new Map()
  const declRe = /(--myz-[a-z0-9-]+)\s*:\s*([^;]+);/g
  let match
  while ((match = declRe.exec(withoutComments))) {
    const name = match[1]
    const value = normalize(match[2])
    if (!vars.has(name)) vars.set(name, new Set())
    vars.get(name).add(value)
  }
  return vars
}

/* ── Parse the Markdown specification ─────────────────────────────── */
function parseMarkdown(source) {
  const names = new Set()
  const values = new Map()

  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("|")) continue
    const backticked = [...trimmed.matchAll(/`([^`]+)`/g)].map((m) => m[1])

    const rowNames = backticked.filter((v) => /^--myz-[a-z0-9-]+$/.test(v))
    const rowValues = backticked.filter((v) => /^#[0-9a-f]{3,8}$/i.test(v))

    for (const name of rowNames) names.add(name)
    if (rowNames.length === 0 || rowValues.length === 0) continue

    if (rowValues.length === rowNames.length) {
      rowNames.forEach((name, index) => {
        if (!values.has(name)) values.set(name, new Set())
        values.get(name).add(normalize(rowValues[index]))
      })
    } else if (rowValues.length === rowNames.length * 2) {
      // Paired light/dark columns: first half light, second half dark.
      const size = rowNames.length
      rowNames.forEach((name, index) => {
        if (!values.has(name)) values.set(name, new Set())
        values.get(name).add(normalize(rowValues[index]))
        values.get(name).add(normalize(rowValues[size + index]))
      })
    } else {
      for (const name of rowNames) {
        if (!values.has(name)) values.set(name, new Set())
        for (const value of rowValues) values.get(name).add(normalize(value))
      }
    }
  }

  return { names, values }
}

/* ── Compare ──────────────────────────────────────────────────────── */
function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

function formatSet(set) {
  return [...set].sort().join(", ")
}

const css = parseCss(readFileSync(CSS_PATH, "utf8"))
const md = parseMarkdown(readFileSync(MD_PATH, "utf8"))

const errors = []
const warnings = []

for (const name of css.keys()) {
  if (!md.names.has(name)) errors.push(`missing in spec: ${name}`)
}
for (const name of md.names) {
  if (name.endsWith("-")) continue // family shorthand such as `--myz-r-*`
  if (!css.has(name)) errors.push(`missing in tokens.css: ${name}`)
}

for (const [name, cssValues] of css) {
  const cssHexes = new Set()
  for (const value of cssValues) for (const hex of hexesIn(value)) cssHexes.add(hex)

  const mdValues = md.values.get(name)
  const mdHexes = new Set()
  if (mdValues) for (const value of mdValues) for (const hex of hexesIn(value)) mdHexes.add(hex)

  if (cssHexes.size === 0 && mdHexes.size === 0) continue
  if (mdHexes.size === 0) {
    warnings.push(`no hex values in spec to compare for ${name}`)
    continue
  }
  if (!setsEqual(cssHexes, mdHexes)) {
    errors.push(
      `hex drift for ${name}:\n    css: ${formatSet(cssHexes)}\n    md:  ${formatSet(mdHexes)}`,
    )
  }
}

const tokenCount = css.size
if (errors.length > 0) {
  console.error(`✗ design token drift (${errors.length} problem(s), ${tokenCount} tokens)`)
  for (const error of errors) console.error(`  - ${error}`)
  for (const warning of warnings) console.warn(`  ! ${warning}`)
  process.exit(1)
}

console.log(`✓ design tokens agree (${tokenCount} tokens, spec ${md.names.size} names)`)
for (const warning of warnings) console.warn(`  ! ${warning}`)
