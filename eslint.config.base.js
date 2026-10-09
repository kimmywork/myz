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

  /**
   * Size guardrails, surfaced as warnings so they inform review without
   * failing existing code. Target is 300 lines per file; the warning is set to
   * 400 for now to grandfather current files. Line length is capped at 120
   * (unbreakable URLs/strings/templates/regex are ignored, since Prettier
   * already wraps everything it can at 80 columns).
   */
  const sizeRules = {
    "max-len": [
      "warn",
      {
        code: 120,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      },
    ],
    "max-lines": [
      "warn",
      { max: 400, skipBlankLines: true, skipComments: true },
    ],
  };

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
        ...sizeRules,
      },
    },
    {
      files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
      rules: sizeRules,
    },
    {
      // Tests/specs may run a little longer than production modules.
      files: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "tests/**",
      ],
      rules: {
        "max-lines": [
          "warn",
          { max: 500, skipBlankLines: true, skipComments: true },
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
