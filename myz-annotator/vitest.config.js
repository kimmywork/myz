import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const currentDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": "/src/",
      "@myz/dashboard-core": `${currentDir}../packages/dashboard-core/src`,
      "@myz/dashboard-ui": `${currentDir}../packages/dashboard-ui/src`,
      "@myz/shared": `${currentDir}../packages/shared/src`,
      "@myz/sync-core": `${currentDir}../packages/sync-core/src`,
    },
  },
  test: {
    environment: "jsdom",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "./temp/**",
      "tests/extension/**",
      "tests/spike/**",
      "tests/pdf/**",
    ],
  },
});
