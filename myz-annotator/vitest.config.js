import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const currentDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": "/src/",
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
      // Playwright suites (extension / spike / pdf / transport) are run by
      // `npm run test:playwright`, not Vitest. `tests/transport` used to leak
      // into `npm run test:dev` because it was missing here.
      "tests/extension/**",
      "tests/spike/**",
      "tests/pdf/**",
      "tests/transport/**",
    ],
  },
});
