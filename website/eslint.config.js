import { createBaseConfig } from "../eslint.config.base.js";
import js from "@eslint/js";

export default [
  {
    ignores: [".vitepress/cache/**", ".vitepress/dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...createBaseConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ["**/*.js"],
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
