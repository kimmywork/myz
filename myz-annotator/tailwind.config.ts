import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx,vue,html}",
    "./src/**/*.{mjs,css}",
    "./index.html",
    "../packages/dashboard-ai-settings/src/**/*.{js,jsx,ts,tsx,vue}",
    "../packages/dashboard-chat-ui/src/**/*.{js,jsx,ts,tsx,vue}",
    "../packages/dashboard-ui/src/**/*.{js,jsx,ts,tsx,vue}",
  ],
} satisfies Config;
