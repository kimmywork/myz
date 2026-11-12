/**
 * One-off measurement for the I9 snapshot truncation threshold (§I9).
 *
 * The threshold answers: "how many consecutive elements may go by without
 * hitting another record before the snapshot stops extending?" Too small and a
 * legitimate gap ends the capture early; too large and the snapshot keeps
 * growing into unrelated page furniture.
 *
 * What is measured, per page:
 *
 * - Split the main content container into its element children.
 * - Mark the ones that carry text (a paragraph, a list item, a tweet body).
 * - For two *adjacent* text blocks, count how many non-text siblings sit
 *   between them. That gap is exactly what the threshold has to bridge.
 *
 * The reported p95 of those gaps is the candidate N: it covers 95% of real
 * gaps between neighbouring content blocks on the sampled pages.
 *
 * Not part of the build. Run with `node scripts/measure/truncation-threshold.mjs`.
 */
import { chromium } from "playwright";

const FIXTURES = new URL("../../myz-annotator/tests/fixtures/", import.meta.url)
  .pathname;

const SAMPLES = [
  ["hn-comment-thread", "/tmp/c-hn-thread.html"],
  ["ruanyifeng-long-article", "/tmp/c-ruan.html"],
  ["ruanyifeng-283", "/tmp/c-ruanyifeng-283.html"],
  ["sspai-article", "/tmp/c-sspai.html"],
  ["fixture-complex", `${FIXTURES}complex-highlight-test.html`],
  ["fixture-x-feed", `${FIXTURES}x-feed-synthetic.html`],
];

const browser = await chromium.launch();
const allGaps = [];

for (const [name, source] of SAMPLES) {
  const url = /^(?:https?|file):/.test(source) ? source : `file://${source}`;
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      // The container we care about is the one that holds *several* text
      // blocks, not the largest single block of text.
      const textChildren = (el) =>
        Array.from(el.children).filter(
          (child) => (child.textContent || "").trim().length > 20,
        ).length;
      const pick = () => {
        const containers = Array.from(
          document.querySelectorAll("article, main, section, div"),
        ).filter((el) => textChildren(el) >= 3);
        if (!containers.length) return document.body;
        return containers.sort(
          (a, b) =>
            (b.textContent || "").trim().length -
            (a.textContent || "").trim().length,
        )[0];
      };
      const root = pick();
      const children = Array.from(root.children);
      const hasText = (el) => (el.textContent || "").trim().length > 20;

      const gaps = [];
      let pending = 0;
      for (const child of children) {
        if (hasText(child)) {
          if (pending > 0) gaps.push(pending);
          pending = 0;
        } else {
          pending += 1;
        }
      }

      gaps.sort((a, b) => a - b);
      const at = (q) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))] ?? 0;
      return {
        children: children.length,
        textBlocks: children.filter(hasText).length,
        gaps: gaps.length,
        median: at(0.5),
        p95: at(0.95),
        max: gaps.length ? Math.max(...gaps) : 0,
        sample: gaps.slice(-8),
      };
    });

    console.log(name, JSON.stringify(result));
    allGaps.push(...(result.sample ?? []));
  } catch (error) {
    console.log(name, "FAILED", String(error).slice(0, 80));
  } finally {
    await page.close();
  }
}

await browser.close();
allGaps.sort((a, b) => a - b);
console.log("ALL_GAPS_P95", allGaps[Math.floor(0.95 * allGaps.length)] ?? 0);
console.log("ALL_GAPS_MAX", allGaps.at(-1) ?? 0);
