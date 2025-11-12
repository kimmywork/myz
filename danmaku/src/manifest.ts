import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "MyZ Danmaku",
  description: "Overlay YouTube comments as danmaku and sync with popup.",
  version: packageJson.version,
  action: {
    default_title: "MyZ Danmaku",
    default_popup: "src/popup/index.html"
  },
  background: {
    service_worker: "src/background.js",
    type: "module"
  },
  icons: {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  permissions: ["storage", "activeTab", "scripting", "tabs"],
  host_permissions: ["https://www.youtube.com/*"],
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["src/content.js"],
      run_at: "document_idle"
    }
  ]
});
