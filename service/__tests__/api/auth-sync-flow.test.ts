import { randomUUID } from "crypto";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { createServer, type Server } from "http";
import { join } from "path";
import os from "os";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createApp, toNodeListener } from "h3";
import { Pool } from "pg";

function solveChallenge(question: string): string {
  const match = question.match(/What is (\d+) ([+-]) (\d+)\?/i);
  if (!match) {
    throw new Error(`Unsupported captcha question: ${question}`);
  }

  const [, left, operator, right] = match;
  const a = Number(left);
  const b = Number(right);

  return operator === "+" ? String(a + b) : String(a - b);
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function getJson(
  baseUrl: string,
  path: string,
  headers?: Record<string, string>
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
}

describe("Auth and sync flow", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let storageRoot = "";
  let server: Server | null = null;
  let baseUrl = "";
  let token = "";
  let dbModule: typeof import("@/db") | null = null;
  let shouldSkip = false;
  let captchaHandler: Awaited<ReturnType<typeof importCaptcha>>["default"] | null = null;
  let loginHandler: Awaited<ReturnType<typeof importLogin>>["default"] | null = null;
  let logoutHandler: Awaited<ReturnType<typeof importLogout>>["default"] | null = null;
  let oauthHandler: Awaited<ReturnType<typeof importOAuth>>["default"] | null = null;
  let registerHandler: Awaited<ReturnType<typeof importRegister>>["default"] | null = null;
  let verifyEmailHandler: Awaited<ReturnType<typeof importVerifyEmail>>["default"] | null = null;
  let pushHandler: Awaited<ReturnType<typeof importPush>>["default"] | null = null;
  let pullHandler: Awaited<ReturnType<typeof importPull>>["default"] | null = null;
  let historyHandler: Awaited<ReturnType<typeof importHistory>>["default"] | null = null;

  async function importCaptcha() {
    return import("@server/api/captcha/challenge.post");
  }

  async function importLogin() {
    return import("@server/api/auth/login.post");
  }

  async function importLogout() {
    return import("@server/api/auth/logout.post");
  }

  async function importOAuth() {
    return import("@server/api/auth/oauth.post");
  }

  async function importRegister() {
    return import("@server/api/auth/register.post");
  }

  async function importVerifyEmail() {
    return import("@server/api/auth/verify-email.post");
  }

  async function importPush() {
    return import("@server/api/sync/push.post");
  }

  async function importPull() {
    return import("@server/api/sync/pull.get");
  }

  async function importHistory() {
    return import("@server/api/sync/history.get");
  }

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer("postgres:17.6")
        .withDatabase(`test_${randomUUID().replace(/-/g, "")}`)
        .withUsername("postgres")
        .withPassword("postgres")
        .start();
    } catch (error) {
      shouldSkip = true;
      container = null;
      console.warn(
        "Skipping integration tests: PostgreSQL container could not be started.",
        error
      );
      return;
    }

    storageRoot = mkdtempSync(join(os.tmpdir(), "myz-storage-"));

    Reflect.set(process.env, "NODE_ENV", "test");
    Reflect.set(process.env, "DATABASE_URL", container.getConnectionUri());
    Reflect.set(process.env, "STORAGE_ROOT", storageRoot);
    Reflect.set(process.env, "CAPTCHA_MODE", "builtin");

    const migrationSql = readFileSync(
      join(process.cwd(), "drizzle/migrations/0000_init.sql"),
      "utf-8"
    );

    const pool = new Pool({ connectionString: container.getConnectionUri() });
    const statements = migrationSql
      .split(/;\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    try {
      for (const statement of statements) {
        await pool.query(statement);
      }
    } finally {
      await pool.end();
    }

    dbModule = await import("@/db");

    const [captchaModule, loginModule, logoutModule, oauthModule, registerModule, verifyEmailModule, pushModule, pullModule, historyModule] =
      await Promise.all([
        importCaptcha(),
        importLogin(),
        importLogout(),
        importOAuth(),
        importRegister(),
        importVerifyEmail(),
        importPush(),
        importPull(),
        importHistory(),
      ]);

    captchaHandler = captchaModule.default;
    loginHandler = loginModule.default;
    logoutHandler = logoutModule.default;
    oauthHandler = oauthModule.default;
    registerHandler = registerModule.default;
    verifyEmailHandler = verifyEmailModule.default;
    pushHandler = pushModule.default;
    pullHandler = pullModule.default;
    historyHandler = historyModule.default;

    const app = createApp();
    app.use("/api/auth/register", registerHandler);
    app.use("/api/auth/verify-email", verifyEmailHandler);
    app.use("/api/auth/login", loginHandler);
    app.use("/api/auth/logout", logoutHandler);
    app.use("/api/auth/oauth", oauthHandler);
    app.use("/api/captcha/challenge", captchaHandler);
    app.use("/api/sync/push", pushHandler);
    app.use("/api/sync/pull", pullHandler);
    app.use("/api/sync/history", historyHandler);

    server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => {
      server?.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to acquire server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (shouldSkip) {
      return;
    }

    await dbModule?.closeDb();
    await container?.stop();
    server?.close();
    if (storageRoot) {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it("allows a full registration, verification, login, and sync cycle", async () => {
    if (shouldSkip) {
      console.warn("Auth and sync flow test skipped because Docker is unavailable.");
      return;
    }

    const email = "test@example.com";

    const captchaResponse = await postJson(baseUrl, "/api/captcha/challenge", {});
    expect(captchaResponse.status).toBe(200);
    const captchaBody = await captchaResponse.json();
    const captchaAnswer = solveChallenge(captchaBody.challenge.question);

    const registerResponse = await postJson(baseUrl, "/api/auth/register", {
      email,
      password: "StrongPass123",
      captchaId: captchaBody.challenge.id,
      captchaAnswer,
    });
    expect(registerResponse.status).toBe(201);
    const registerBody = await registerResponse.json();
    expect(registerBody.requiresVerification).toBe(true);
    expect(registerBody.verificationToken).toBeDefined();

    const verifyResponse = await postJson(baseUrl, "/api/auth/verify-email", {
      token: registerBody.verificationToken,
      email,
    });
    expect(verifyResponse.status).toBe(200);

    const loginCaptchaResponse = await postJson(baseUrl, "/api/captcha/challenge", {});
    expect(loginCaptchaResponse.status).toBe(200);
    const loginCaptcha = await loginCaptchaResponse.json();
    const loginCaptchaAnswer = solveChallenge(loginCaptcha.challenge.question);

    const loginResponse = await postJson(
      baseUrl,
      "/api/auth/login",
      {
        email,
        password: "StrongPass123",
        captchaId: loginCaptcha.challenge.id,
        captchaAnswer: loginCaptchaAnswer,
      },
      {
        "user-agent": "jest-test-suite",
      }
    );
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as {
      token: string;
    };
    token = loginBody.token;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    const now = new Date().toISOString();

    const pushResponse = await postJson(
      baseUrl,
      "/api/sync/push",
      {
        cursor: 0,
        changes: [
          {
            id: "annotation-1",
            type: "create",
            payload: { label: "Important", value: 1 },
            updatedAt: now,
          },
        ],
        summary: "Initial sync",
      },
      {
        Authorization: `Bearer ${token}`,
      }
    );
    expect(pushResponse.status).toBe(200);
    const pushBody = await pushResponse.json();
    expect(pushBody.cursor).toBe(1);
    expect(pushBody.snapshot.annotations["annotation-1"]).toMatchObject({
      id: "annotation-1",
      data: { label: "Important", value: 1 },
    });

    const pullResponse = await getJson(
      baseUrl,
      "/api/sync/pull?cursor=0",
      {
        Authorization: `Bearer ${token}`,
      }
    );
    expect(pullResponse.status).toBe(200);
    const pullBody = await pullResponse.json();
    expect(pullBody.cursor).toBe(1);
    expect(pullBody.snapshot.annotations["annotation-1"].data.value).toBe(1);
    expect(Array.isArray(pullBody.changes)).toBe(true);
    expect(pullBody.changes).toHaveLength(1);

    const historyResponse = await getJson(
      baseUrl,
      "/api/sync/history",
      {
        Authorization: `Bearer ${token}`,
      }
    );
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    expect(historyBody.history).toHaveLength(1);
    expect(historyBody.history[0].summary).toBe("Initial sync");
  });
});
