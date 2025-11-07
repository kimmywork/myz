import { defineNuxtConfig } from "nuxt/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  srcDir: "src",
  alias: {
    "@": resolve(currentDir, "src"),
  },
  css: ["~/assets/styles/globals.css"],
  app: {
    head: {
      title: "MyZ Sync Portal",
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        {
          name: "description",
          content: "Manage MyZ Annotator accounts and synchronization",
        },
      ],
    },
  },
  vite: {
    plugins: [
        tailwindcss(),
    ]
  },
  runtimeConfig: {
    captcha: {
      bypassToken: process.env.CAPTCHA_BYPASS_TOKEN,
    },
    public: {
      disableAutoRedirect: process.env.NUXT_PUBLIC_DISABLE_AUTO_REDIRECT ?? "0",
    },
  },
  nitro: {
    experimental: {
      openAPI: false,
    },
    compatibilityDate: '2025-11-06'
  },
  typescript: {
    shim: false,
  },
});
