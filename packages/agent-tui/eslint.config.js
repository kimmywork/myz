import { createBaseConfig } from "../../eslint.config.base.js";
import globals from "globals";

export default [
  ...createBaseConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
