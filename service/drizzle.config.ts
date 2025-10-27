import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";

const envFiles = [".env.local", ".env.development.local", ".env"] as const;

for (const file of envFiles) {
  if (existsSync(file)) {
    loadEnv({ path: file });
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
