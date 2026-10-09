import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "myz-pdf-paged.pdf");

const pages = Array.from({ length: 30 }, (_, index) => {
  const n = index + 1;
  return `<section class="page">
    <h1>Page ${n}</h1>
    <p>Page ${n} alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu.</p>
    <p>Page ${n} the quick brown fox jumps over the lazy dog near the riverbank while another quick brown fox quietly watches from the shadows.</p>
  </section>`;
}).join("");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.7; margin: 48px; color: #111; }
  .page { break-after: page; }
  h1 { font-size: 20px; margin: 0 0 20px; }
  p { margin: 0 0 18px; }
</style>
</head>
<body>${pages}</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: target, format: "A4", printBackground: true });
await browser.close();
console.log("wrote", target);
