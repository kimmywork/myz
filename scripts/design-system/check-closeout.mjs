#!/usr/bin/env node
/*
 * Closeout guard for the I10 visual pass.
 *
 * Checks the machine-checkable half of the acceptance list so "did this page
 * close out?" is not a matter of opinion:
 *
 *   A1  `.btn` / `.stitch-btn` naming  — no second button primitive
 *   A2  `.settings__*` gone            — settings styling lives in components
 *   A3  control heights                — only 28 / 32 / 36 / 44 (+ row 40/56/64)
 *   A5  spacing scale                  — only 4 / 8 / 12 / 16 / 24 / 32
 *   A7  raw hex in new app code        — colours come from tokens
 *
 * Usage: `node scripts/design-system/check-closeout.mjs`
 *
 * Three modes:
 * - default: report only.
 * - `--ratchet`: compare with `closeout-baseline.json` and fail if a check got
 *   worse, or if the total did. This is what CI runs: the pass is not finished,
 *   so absolute zero is not enforced yet, but the number can only go down.
 *   When a check improves, lower its number in the baseline in the same PR.
 *   `--baseline <path>` points the ratchet at another file. CI passes the copy
 *   from the BASE branch, otherwise the gate would be self-certifying: edit the
 *   number in your own branch and the check turns green.
 * - `--strict`: fail on any violation at all (the state once A1/A2 reach 0).
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const SRC = resolve(root, "myz-annotator/src")
const strict = process.argv.includes("--strict")
const ratchet = process.argv.includes("--ratchet")
const baselineIndex = process.argv.indexOf("--baseline")
const baselineArg =
  baselineIndex >= 0 ? process.argv[baselineIndex + 1] : ""

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".css"])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (CODE_EXTENSIONS.has(extname(full))) out.push(full)
  }
  return out
}

/** Directories that render product UI and must read their colours from tokens. */
const UI_SURFACES = [
  "myz-annotator/src/dashboard",
  "myz-annotator/src/popup",
  "myz-annotator/src/reader",
  "myz-annotator/src/epub",
  "myz-annotator/src/pdf",
]

function isUiSurface(file) {
  const relativePath = relative(root, file)
  return UI_SURFACES.some((dir) => relativePath.startsWith(dir))
}

function extname(file) {
  const index = file.lastIndexOf(".")
  return index < 0 ? "" : file.slice(index)
}

const files = walk(SRC)
const violations = []
function fail(check, file, line, detail) {
  violations.push({
    check,
    file: relative(root, file),
    line,
    detail,
  })
}

/**
 * Drops `//` and `/* *\/` comments without touching strings.
 *
 * A plain `line.replace(/\/\/.*$/, "")` eats everything after `https:` in a
 * URL, so a violation on that line was invisible to the checks.
 *
 * Known limit: a `/*` block that spans lines is not tracked, so the lines after
 * it are scanned as code. That can produce a false positive (never a missed
 * violation), and a false positive fails the ratchet loudly rather than
 * passing quietly.
 */
function stripComments(line) {
  let out = ""
  let quote = ""
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (quote) {
      out += char
      if (char === "\\") {
        out += next ?? ""
        index += 1
      } else if (char === quote) {
        quote = ""
      }
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      out += char
      continue
    }
    if (char === "/" && next === "/") break
    if (char === "/" && next === "*") {
      const end = line.indexOf("*/", index + 2)
      if (end < 0) break
      index = end + 1
      continue
    }
    out += char
  }
  return out
}

/** Matches a whole class token, so `btn-link` does not match `btn` twice. */
function tokenMatches(source, token) {
  const re = new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`)
  return re.test(source)
}

const ALLOWED_HEIGHTS = new Set(["28", "32", "36", "40", "44", "56", "64"])
/**
 * Status pills are component-internal sizes, not controls (§4.29).
 *
 * Counting a pill as a control is how this check first reported five false
 * alarms: they were `rounded-tag` chips at 22px, which is off the pill scale
 * (16 / 18 / 20) rather than off the control scale.
 */
const ALLOWED_PILL_HEIGHTS = new Set(["16", "18", "20"])
const ALLOWED_SPACING = new Set(["4", "8", "12", "16", "24", "32"])
/** Component-internal sizes the spec exempts. */
const SPACING_EXEMPT = new Set(["1", "2", "3", "5", "6", "10", "18", "22"])

for (const file of files) {
  const isCss = extname(file) === ".css"
  const lines = readFileSync(file, "utf8").split("\n")

  lines.forEach((line, index) => {
    const lineNo = index + 1
    // Comments are not usage.
    const code = stripComments(line)

    // A1: the dashboard button classes are a transitional primitive.
    if (!isCss && /\bclass(?:Name)?=/.test(code)) {
      if (tokenMatches(code, "btn")) fail("A1", file, lineNo, "`.btn` still used")
    }
    if (isCss && /^\s*\.btn\b/.test(code)) {
      fail("A1", file, lineNo, "`.btn` rule still defined")
    }

    // A2: settings modifiers.
    if (code.includes("settings__")) {
      fail("A2", file, lineNo, "`settings__` still used")
    }

    // A3: heights, with pills judged by their own scale.
    const isPill =
      /rounded-(?:tag|full)/.test(code) && /text-tag/.test(code)
    for (const match of code.matchAll(/\bh-\[(\d+)px\]/g)) {
      const allowed = isPill ? ALLOWED_PILL_HEIGHTS : ALLOWED_HEIGHTS
      if (!allowed.has(match[1])) {
        const kind = isPill ? "pill height" : "control height"
        fail("A3", file, lineNo, `${kind} ${match[1]}px is off-scale`)
      }
    }

    // A5: arbitrary spacing values.
    for (const match of code.matchAll(/\b(?:gap|p[trblxy]?|m[trblxy]?)-\[(\d+)px\]/g)) {
      if (!ALLOWED_SPACING.has(match[1]) && !SPACING_EXEMPT.has(match[1])) {
        fail("A5", file, lineNo, `spacing ${match[1]}px is off-scale`)
      }
    }

    // A7: raw hex colours in UI code.
    //
    // Scoped to the UI surfaces on purpose: the content layer draws its own
    // chrome, the snapshot stylesheet is stored inside snapshots (it has to
    // stay readable under any host theme), and the background/constants files
    // are where token values themselves are defined. Banning hex there would be
    // a rule with no meaning.
    if (!isCss && isUiSurface(file) && /#[0-9a-fA-F]{3,8}\b/.test(code)) {
      // Inline SVG strokes and the palette itself legitimately carry colours;
      // everything else should read a token. Matching `color` anywhere made
      // `style={{ color: "#123456" }}` pass as "palette".
      const isSvg = /stroke=|fill=/.test(code)
      const isPalette = /palette|colorPalette|SWATCHES/i.test(code)
      if (!isSvg && !isPalette) {
        fail("A7", file, lineNo, "raw hex colour")
      }
    }
  })
}

const byCheck = new Map()
for (const violation of violations) {
  const list = byCheck.get(violation.check) ?? []
  list.push(violation)
  byCheck.set(violation.check, list)
}

const labels = {
  A1: ".btn / second button primitive",
  A2: "settings__ modifiers",
  A3: "control heights off-scale",
  A5: "spacing off-scale",
  A7: "raw hex in app code",
}

console.log("I10 closeout checks")
console.log("===================")
for (const [check, label] of Object.entries(labels)) {
  const list = byCheck.get(check) ?? []
  console.log(`${check} ${label}: ${list.length}`)
  for (const violation of list.slice(0, 12)) {
    console.log(`   ${violation.file}:${violation.line}  ${violation.detail}`)
  }
  if (list.length > 12) console.log(`   … ${list.length - 12} more`)
}

const total = violations.length
console.log("")
console.log(`${total} violation(s) across ${files.length} files`)

const counts = Object.fromEntries(
  Object.keys(labels).map((check) => [check, (byCheck.get(check) ?? []).length]),
)

if (ratchet) {
  const baselinePath = baselineArg
    ? resolve(baselineArg)
    : resolve(dirname(fileURLToPath(import.meta.url)), "closeout-baseline.json")
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
  // Against the base branch only regressions matter: a PR may improve without
  // touching the file, and CI runs this mode with `--baseline origin/<base>`.
  // Against the repo's own file the numbers must match exactly, otherwise an
  // improvement leaves headroom that a later change can quietly spend.
  const authoritative = !baselineArg
  const regressions = []
  const stale = []
  for (const [check, count] of Object.entries(counts)) {
    const allowed = baseline.counts?.[check] ?? 0
    if (count > allowed) regressions.push(`${check}: ${allowed} → ${count}`)
    else if (authoritative && count < allowed) {
      stale.push(`${check}: ${allowed} → ${count}`)
    }
  }
  if (total > (baseline.total ?? 0)) {
    regressions.push(`total: ${baseline.total} → ${total}`)
  } else if (authoritative && total < (baseline.total ?? 0)) {
    stale.push(`total: ${baseline.total} → ${total}`)
  }
  if (stale.length) {
    console.error(
      `✗ baseline is higher than the code: ${stale.join("; ")} — ` +
        `lower it in ${relative(root, baselinePath)} in this change, ` +
        `so the next change cannot spend the slack`,
    )
    process.exit(1)
  }
  if (regressions.length) {
    console.error(`✗ closeout regressions: ${regressions.join("; ")}`)
    process.exit(1)
  }
  console.log("✓ no closeout regressions")
  process.exit(0)
}

if (strict && total > 0) {
  console.error("✗ closeout checks failed (--strict)")
  process.exit(1)
}
if (!strict && total > 0) {
  console.log("(report only — pass --strict to enforce)")
}
