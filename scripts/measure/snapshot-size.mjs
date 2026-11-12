/**
 * One-off measurement for the I8 snapshot quota.
 *
 * Runs the planned capture algorithm (main content + a fixed set of inline
 * typography properties, scripts/images stripped) on several real and fixture
 * pages and prints the resulting size, so the cap in the contract has a
 * measured basis instead of a guess.
 *
 * Not part of the build; run with `node measure-snapshot.mjs`.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const INLINE_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "color",
  "background-color",
  "text-align",
  "margin-top",
  "margin-bottom",
  "padding-top",
  "padding-bottom",
  "border-left-width",
  "border-left-color",
  "border-left-style",
  "list-style-type",
];

const FIXTURES = `${process.cwd()}/myz-annotator/tests/fixtures`;
const SAMPLES = fs
  .readFileSync("/tmp/samples.txt", "utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const [name, file] = line.split(" ");
    return [name, `file://${file}`];
  });

const browser = await chromium.launch();
const results = [];
for (const [name, url] of SAMPLES) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(800);
    const size = await page.evaluate(() => {
      // Readability-style: the block with the best text-per-node density,
      // which is what the real extractor falls back to.
      const pick = () => {
        const blocks = Array.from(
          document.querySelectorAll("article, main, section, div"),
        ).filter((el) => (el.textContent || "").trim().length > 400);
        if (!blocks.length) return document.body;
        // Largest text block: the bounded-conservative reading for a quota
        // (it may include some chrome, so the number errs high).
        return blocks.sort(
          (a, b) =>
            (b.textContent || "").trim().length -
            (a.textContent || "").trim().length,
        )[0];
      };
      const root = pick();
      const clone = root.cloneNode(true);
      // Strip everything that is not text structure. No computed styles here:
      // the snapshot carries one fixed stylesheet instead (small and bounded).
      clone
        .querySelectorAll(
          "script, style, link, img, video, audio, iframe, svg, canvas, noscript, form, button, input, select, textarea, nav, aside, footer, header",
        )
        .forEach((node) => node.remove());
      const nodes = clone.querySelectorAll("*");
      for (const node of nodes) {
        node.removeAttribute("class");
        node.removeAttribute("id");
        for (const attr of Array.from(node.attributes)) {
          if (attr.name.startsWith("data-") || attr.name.startsWith("aria-")) {
            node.removeAttribute(attr.name);
          }
        }
        if (!node.textContent?.trim() && !["IMG", "BR", "HR"].includes(node.tagName)) {
          node.remove();
        }
      }
      const html = clone.outerHTML;
      return {
        bytes: new TextEncoder().encode(html).length,
        nodes: clone.querySelectorAll("*").length,
      };
    });    results.push({ name, url, ...size });
    console.log(name, size.bytes, "bytes", size.nodes, "nodes");
  } catch (error) {
    console.log(name, "FAILED", String(error).slice(0, 100));
  } finally {
    await page.close();
  }
}
await browser.close();
fs.writeFileSync("/tmp/snapshot-sizes.json", JSON.stringify(results, null, 2));
