import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";
import pluginVue from "eslint-plugin-vue";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import { createBaseConfig } from "../eslint.config.base.js";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

const baseConfigs = createBaseConfig({
  tsconfigRootDir: import.meta.dirname,
});

// Add browser globals to base TS config
for (const config of baseConfigs) {
  if (config.files?.includes("**/*.ts")) {
    config.languageOptions.globals = {
      ...config.languageOptions.globals,
      RequestCredentials: "readonly",
      IDBTransactionMode: "readonly",
      IDBValidKey: "readonly",
      ParentNode: "readonly",
      BlobPart: "readonly",
      PointerEventInit: "readonly",
      MouseEventInit: "readonly",
      KeyboardEventInit: "readonly",
      InputEventInit: "readonly",
    };
    // Also apply to JS files
    config.files = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
    config.rules = {
      ...config.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_|^error$|^e$|^event$|^tab$|^options$|^styles$",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^error$|^e$",
        },
      ],
    };
  }
}

export default defineConfig([
  eslintPluginPrettierRecommended,
  ...pluginVue.configs["flat/recommended"],
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  ...baseConfigs,
  // Test files need node globals
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        global: "readonly",
      },
    },
  },
  // Config and script files need node globals
  {
    files: [
      "**/*.config.ts",
      "**/*.config.js",
      "**/*.config.mjs",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        process: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
]);
