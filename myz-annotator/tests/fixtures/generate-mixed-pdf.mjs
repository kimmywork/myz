import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "myz-pdf-mixed.pdf");

const svg =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><rect width='46' height='46' rx='6' fill='#3366cc'/></svg>",
  );

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.7; margin: 48px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 20px; }
  p { margin: 0 0 18px; }
  .sans { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .mono { font-family: "SFMono-Regular", Menlo, monospace; }
  .cjk { font-family: "PingFang SC", "Songti SC", serif; }
  .math { font-style: italic; }
  img { height: 42px; width: 42px; vertical-align: middle; }
</style>
</head>
<body>
  <h1>Mixed Script PDF</h1>
  <p id="latin">The quick brown fox jumps over the lazy dog near the riverbank while another quick brown fox quietly watches from the shadows.</p>
  <p id="sans" class="sans">Modern interfaces increasingly rely on clean sans-serif typography for dense paragraphs of explanatory text that must remain readable.</p>
  <p id="greek">Greek letters αβγδεζηθικλμνξοπρστυφχψω appear in the middle of an otherwise ordinary English sentence about geometry.</p>
  <p id="math" class="math">Equations like ∑ √(x² + y²) ≤ ∞ and α ≈ β ≠ γ are common throughout the surrounding text.</p>
  <p id="cjk" class="cjk">中文测试：这是一个包含简体中文、标点符号与英文 mixed 的段落，用来验证选区与高亮的对齐情况。</p>
  <p id="mixed">Inline image <img src="${svg}" alt="" /> with <span class="sans">sans-serif</span> and <span class="mono">monospace</span> and <span class="cjk">中文</span> all mixing on one line.</p>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: target, format: "A4", printBackground: true });
await browser.close();
console.log("wrote", target);
