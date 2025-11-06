import type { Config } from "tailwindcss";

const config = {
  content: [
    "./src/**/*.{vue,tsx,ts,jsx,js}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
