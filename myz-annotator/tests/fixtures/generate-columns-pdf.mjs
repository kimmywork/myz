import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "myz-pdf-columns.pdf");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.55; color: #111; }
  .page { padding: 56px 48px; display: flex; gap: 56px; }
  .side { width: 30%; }
  .side .display { font-size: 46px; line-height: 1.05; font-weight: 700; margin: 0 0 28px; }
  .side .caption { font-size: 12px; line-height: 1.5; text-indent: 0; }
  .main { width: 62%; }
  .main p { margin: 0; text-indent: 1.6em; }
  .main p.first { text-indent: 0; }
  .main h2 { font-size: 21px; color: #16386b; margin: 20px 0 12px; }
</style>
</head>
<body>
  <div class="page">
    <div class="side">
      <p class="display">Master<br />Master<br />Master</p>
      <p class="caption"><b>FIGURE 1.5</b> These three samples represent the same typeface, but they've been created using different master designs. The one at the top is based on a design for small type, and of the three it clearly has the heaviest bulk and greatest width.</p>
    </div>
    <div class="main">
      <p class="first">Because metal type foundries needed to create separate sets of printing blocks for every type size that printers wanted to use, it was easy enough for them to follow this calligraphic tradition. The practice continued into the latter half of the twentieth century.</p>
      <p>Vendors of typesetting systems were happy they didn't have to design type over and over for every size they wanted to produce, but it was a setback for the quality of printed material. When all sizes of type were produced from a single master, small type became pinched looking and hard to read.</p>
      <h2>Evolution and Automation</h2>
      <p>The ink wasn't dry on Gutenberg's Bible before imitators came up with similar typesetting and printing systems. Type styles proliferated and popular styles were mercilessly plagiarized. There were no universal standards for the proportions or dimensions of the type blocks used to set type.</p>
      <p>For almost 400 years, though, the processes of typesetting and printing very much resembled those practiced by Gutenberg. Type was set letter by letter, and after a print run, the type was dumped in a pile to be sorted and redistributed into its cases.</p>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: target, format: "A4", printBackground: true });
await browser.close();
console.log("wrote", target);
