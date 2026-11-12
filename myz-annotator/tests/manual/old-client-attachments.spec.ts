import { test, expect } from "@playwright/test";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta, send } from "../helpers/runtime.js";

/**
 * One-off: prove an older build keeps an attachment field it does not know.
 *
 * NOT part of CI — it needs a second (pre-I7) extension build, so it lives
 * here only to be run by hand when the record schema changes. Run with:
 *
 *   OLD_EXTENSION_DIST=<worktree>/myz-annotator/dist npx playwright test \
 *     tests/manual/old-client-attachments.spec.ts
 *
 * This is *not* a 0.6.6 test: no such tag exists. The old build is the commit
 * right before I7, which is the same client minus the optional field.
 */
const __dirname = dirnameFromImportMeta(import.meta.url);
const OLD_DIST =
  process.env.OLD_EXTENSION_DIST ||
  path.join(__dirname, "..", "..", "..", ".tmp-old-build", "myz-annotator", "dist");

test("old_build_reads_edits_and_writes_back_an_attachment", async () => {
  const launched = await launchExtension(OLD_DIST);
  const { context } = launched;
  const dash = await context.newPage();
  await dash.goto(
    `chrome-extension://${launched.extensionId}/src/dashboard/index.html#/highlights`,
  );
  await dash.waitForSelector(".app-shell", { timeout: 8000 });

  // A record written by the newer build: additive attachment field only.
  const saved = await send<{ id: string; tags?: string[] }>(
    dash,
    "myz:saveHighlight",
    {
      kind: "clip",
      text: "captured image",
      url: "https://example.com/post",
      sourceUrl: "https://example.com/post",
      title: "A post",
      hostname: "example.com",
      tags: ["before"],
      attachments: [
        { assetId: "asset-1", mime: "image/png", width: 1280, height: 720 },
      ],
    },
  );
  expect(saved.id).toBeTruthy();

  // The old build's own edit path: read, spread, patch tags, write back.
  await send(dash, "myz:updateHighlight", {
    id: saved.id,
    tags: ["before", "after"],
  });

  const exported = await send<{ json: string }>(dash, "myz:export", {});
  const records = JSON.parse(exported.json) as Array<Record<string, unknown>>;
  const record = records.find((entry) => entry.id === saved.id);

  console.log("OLD_BUILD_RECORD", JSON.stringify(record));
  expect(record?.tags).toEqual(["before", "after"]);
  expect(record?.attachments).toEqual([
    { assetId: "asset-1", mime: "image/png", width: 1280, height: 720 },
  ]);
  expect(record?.schemaVersion).toBe("1.0.0");

  await context.close();
});
