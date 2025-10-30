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
  {
    files: ["**/*.js", "**/*.mjs"],
    plugins: {
      js,
    },
    extends: ["js/recommended"],
    rules: {
      "no-unused-vars": "warn",
    },
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: true,
      },
    },
  },
  {
    files: ["*.jsx", "**/*.jsx"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    // your overrides
  },
]);
