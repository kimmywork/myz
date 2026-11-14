#!/usr/bin/env node
/*
 * Release gate: the built extension must not grow without someone deciding it.
 *
 * The limit is 45 MiB against a measured 40.80 MiB (about 10% headroom; `du`
 * reports 44M because that is disk-block usage, not bytes). Raising it is a
 * separate commit that says why — the same rule as the closeout baseline. The
 * five largest files are printed so growth points at a file, not at a total.
 *
 * Scope: the Chrome extension artifact (MV3, Chrome Web Store). `vite build
 * --target firefox` writes `dist-firefox`, and that output is deliberately NOT
 * measured: 0.7 has no Firefox release target. If one is added, it needs its
 * own limit and its own justification, not this number.
 *
 * Usage: `node scripts/check-dist-size.mjs` (or `--limit-mib <n>` to probe it).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "myz-annotator/dist");
const DEFAULT_LIMIT_MIB = 45;

const index = process.argv.indexOf("--limit-mib");
const limitMib =
  index >= 0 ? Number(process.argv[index + 1]) : DEFAULT_LIMIT_MIB;
if (!Number.isFinite(limitMib) || limitMib <= 0) {
  console.error("✗ --limit-mib needs a positive number");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push({ path: full, size: statSync(full).size });
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`✗ no build at ${DIST} — run the build first`);
  process.exit(1);
}

const bytes = files.reduce((sum, file) => sum + file.size, 0);
const mib = (value) => `${(value / (1024 * 1024)).toFixed(2)} MiB`;
const limit = limitMib * 1024 * 1024;

console.log(`dist: ${mib(bytes)} in ${files.length} files (limit ${limitMib} MiB)`);
if (existsSync(resolve(root, "myz-annotator/dist-firefox"))) {
  console.log(
    "  note: dist-firefox exists but is not gated — 0.7 has no Firefox target",
  );
}
for (const file of files.sort((a, b) => b.size - a.size).slice(0, 5)) {
  console.log(`  ${mib(file.size).padStart(10)}  ${relative(DIST, file.path)}`);
}

if (bytes > limit) {
  console.error(
    `✗ dist is ${mib(bytes)}, over the ${limitMib} MiB limit by ${mib(bytes - limit)}. ` +
      `Raising the limit is its own commit with a reason — do not fold it in.`,
  );
  process.exit(1);
}
console.log("✓ within the limit");
