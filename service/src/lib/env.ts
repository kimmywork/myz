import fs from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const candidateEnvFiles = [
  ".env",
  ".env.local",
  `.env.${process.env.NODE_ENV ?? "development"}`,
  `.env.${process.env.NODE_ENV ?? "development"}.local`,
];

const { existsSync } = fs;
const { resolve } = path;

for (const fileName of candidateEnvFiles) {
  const absolutePath = resolve(process.cwd(), fileName);
  if (existsSync(absolutePath)) {
    loadDotenv({ path: absolutePath, override: false });
  }
}

const normalizedNodeEnv = ["development", "test", "production"].includes(
  process.env.NODE_ENV ?? ""
)
  ? (process.env.NODE_ENV as "development" | "test" | "production")
  : "development";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default(normalizedNodeEnv),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL must be provided")
    .transform((value) => value.trim()),
  STORAGE_ROOT: z
    .string()
    .min(1)
    .default("./storage")
    .transform((value) => value.trim()),
  CAPTCHA_MODE: z
    .enum(["builtin", "hcaptcha", "recaptcha", "test-bypass"])
    .default("builtin"),
  CAPTCHA_SECRET_KEY: z.string().optional(),
  CAPTCHA_SITE_KEY: z.string().optional(),
  CAPTCHA_BYPASS_TOKEN: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []
    ),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}

export const env = getEnv();

export const isDevelopment = env.NODE_ENV === "development";
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
