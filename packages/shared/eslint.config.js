import globals from "globals";
import { createBaseConfig } from "../../eslint.config.base.js";

const baseConfigs = createBaseConfig({
  tsconfigRootDir: import.meta.dirname,
  extraGlobals: {
    ParentNode: "readonly",
    IDBDatabase: "readonly",
    IDBObjectStore: "readonly",
    IDBRequest: "readonly",
    IDBTransactionMode: "readonly",
    IDBValidKey: "readonly",
  },
});

export default [
  ...baseConfigs,
  // Test files need node globals
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
        global: "readonly",
      },
    },
  },
];
