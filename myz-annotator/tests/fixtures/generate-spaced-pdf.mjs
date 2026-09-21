import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "myz-pdf-spaced.pdf");

// A technical-book page: paragraphs separated by a little extra leading and no
// first-line indent, with a bold heading and an italic figure caption.
const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.4; color: #111; }
  .page { padding: 56px 72px; }
  .figure { border: 1px solid #ccc; border-radius: 4px; padding: 14px 16px; margin: 0 0 8px; font-size: 13px; }
  .figure h4 { margin: 0 0 6px; font-size: 14px; }
  .caption { font-style: italic; margin: 0 0 14px; }
  h3 { font-size: 16px; margin: 12px 0 8px; }
  p { margin: 0 0 8px; }
</style>
</head>
<body>
  <div class="page">
    <div class="figure">
      <h4>Integrate with your cloud</h4>
      <p>The enterprise version of Edge Impulse integrates directly with the data stored in your cloud platform.</p>
    </div>
    <p class="caption">Figure 13-2. Connecting your mobile phone to your Edge Impulse project</p>
    <h3>nRF Edge Impulse mobile phone application</h3>
    <p>First, download and install the Nordic nRF Edge Impulse app for your iPhone or Android phone. Then, follow the instructions in the Edge Impulse documentation to log in to the nRF Edge Impulse app with your Edge Impulse account and connect your Thingy:53 to your project.</p>
    <p>To record and upload a new data sample into your project, click on the "+" button at the top right of the app. Select your sensor, type in the sample label, and choose a sample length and frequency, then select Start Sampling.</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: target, format: "A4", printBackground: true });
await browser.close();
console.log("wrote", target);
