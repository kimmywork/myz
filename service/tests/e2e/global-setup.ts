import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

const MIGRATION_PATH = join(process.cwd(), "drizzle/migrations/0000_init.sql");
const ENV_FILE_PATH = join(process.cwd(), "tests/e2e/.playwright-env");

export default async function globalSetup() {
  const databaseName = `playwright_${randomUUID().replace(/-/g, "")}`;

  const container = await new PostgreSqlContainer("postgres:17.6")
    .withDatabase(databaseName)
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const connectionUri = container.getConnectionUri();
  const storageRoot = await mkdtemp(join(tmpdir(), "myz-playwright-storage-"));

  process.env.DATABASE_URL = connectionUri;
  process.env.STORAGE_ROOT = storageRoot;
  process.env.CAPTCHA_MODE = process.env.CAPTCHA_MODE ?? "builtin";
  process.env.NUXT_PUBLIC_DISABLE_AUTO_REDIRECT = "1";
  process.env.TESTCONTAINERS_RYUK_DISABLED = process.env.TESTCONTAINERS_RYUK_DISABLED ?? "true";
  process.env.PLAYWRIGHT_ENV_FILE = ENV_FILE_PATH;

  const migrationSql = await readFile(MIGRATION_PATH, "utf-8");
  const statements = migrationSql
    .split(/;\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const pool = new Pool({ connectionString: connectionUri });
  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }

  const envLines = [
    `export NODE_ENV="test"`,
    `export DATABASE_URL="${connectionUri}"`,
    `export STORAGE_ROOT="${storageRoot}"`,
    `export CAPTCHA_MODE="${process.env.CAPTCHA_MODE}"`,
  `export NUXT_PUBLIC_DISABLE_AUTO_REDIRECT="1"`,
  ];

  await writeFile(ENV_FILE_PATH, `${envLines.join("\n")}\n`, "utf-8");

  return async () => {
    await container.stop();
    await rm(storageRoot, { recursive: true, force: true });
    await rm(ENV_FILE_PATH, { force: true });
  };
}
