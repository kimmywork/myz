import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

export function createBaseConfig(options = {}) {
  const {
    tsconfigRootDir = ".",
    extraGlobals = {},
  } = options;

  const configs = [
    {
      ignores: ["dist/**", "node_modules/**", "**/*.d.ts"],
    },
    js.configs.recommended,
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          project: false,
          ecmaVersion: "latest",
          sourceType: "module",
          tsconfigRootDir,
        },
        globals: {
          ...globals.browser,
          ...globals.webworker,
          ...globals.es2021,
          chrome: "readonly",
          ...extraGlobals,
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
    {
      files: ["**/*.config.ts", "**/*.config.js", "vite.config.ts", "scripts/**/*.mjs"],
      languageOptions: {
        globals: {
          ...globals.node,
          ...globals.es2021,
        },
      },
    },
  ];

  return configs;
}

export default createBaseConfig;
