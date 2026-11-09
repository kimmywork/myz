/**
 * Keeps `myz-annotator/package.json` and `myz-annotator/manifest.json` in sync.
 *
 * The extension version is stored twice (package.json feeds the build/release
 * tooling, manifest.json is what Chrome reads), and a drift makes the packaged
 * zip report a version users never installed. Run from the repo root:
 * `npm run check:version`; the annotator build also runs it first.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../myz-annotator/", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", root), "utf8"),
);

if (pkg.version !== manifest.version) {
  const rel = fileURLToPath(root);
  console.error(
    `Version mismatch: ${rel}package.json is ${pkg.version}, ` +
      `manifest.json is ${manifest.version}. Update both before building.`,
  );
  process.exit(1);
}

console.log(`✓ extension version ${pkg.version} agrees across package/manifest`);
