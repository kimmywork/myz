import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx,vue,html}",
    "./src/**/*.{mjs,css}",
    "./index.html",
    "../packages/dashboard-ui/src/**/*.{js,jsx,ts,tsx,vue}",
  ],
  plugins: [typography()],
} satisfies Config;
