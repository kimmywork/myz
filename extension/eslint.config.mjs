import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";

import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

export default defineConfig([
  eslintPluginPrettierRecommended,
  ...pluginVue.configs["flat/recommended"],
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    // your overrides
  },
  {
    files: [
      "**/*.js",
      "**/*.mjs",
      "!dev/repro.js",
      "*.jsx",
      "**/*.jsx",
      "!tests/**/*.js",
    ],
    plugins: {
      js,
    },
    ...js.configs.recommended,
    rules: {
      "no-unused-vars": "warn",
    },
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: true,
      },
      parserOptions: {
        ecmaVersion: 2025,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: ["dev/**/*.js", "tests/**/*.js"],
    plugins: {
      js,
    },
    ...js.configs.recommended,
    rules: {
      "no-unused-vars": "warn",
    },
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.commonjs,
        ...globals.node,
        ...globals.jest,
      },
    },
  },
]);
