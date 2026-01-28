import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import unicorn from "eslint-plugin-unicorn";

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
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.webworker,
        ...globals.es2021,
        chrome: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      jsdoc,
      unicorn,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "unicorn/prefer-module": "off",
      "import/order": [
        "warn",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
]);
