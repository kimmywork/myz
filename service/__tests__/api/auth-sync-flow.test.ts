import { randomUUID } from "crypto";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { NextRequest } from "next/server";
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

function buildJsonRequest(url: string, body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function buildGetRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers,
  });
}

describe("Auth and sync flow", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let storageRoot = "";
  let token: string;
  let registerRoute: typeof import("@/app/api/auth/register/route");
  let verifyRoute: typeof import("@/app/api/auth/verify-email/route");
  let loginRoute: typeof import("@/app/api/auth/login/route");
  let captchaRoute: typeof import("@/app/api/captcha/challenge/route");
  let pushRoute: typeof import("@/app/api/sync/push/route");
  let pullRoute: typeof import("@/app/api/sync/pull/route");
  let historyRoute: typeof import("@/app/api/sync/history/route");
  let dbModule: typeof import("@/db") | null = null;
  let shouldSkip = false;

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
      .split(/;\s*\n/) // rudimentary split on semicolons followed by newline
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }

    await pool.end();

    dbModule = await import("@/db");

    registerRoute = await import("@/app/api/auth/register/route");
    verifyRoute = await import("@/app/api/auth/verify-email/route");
    loginRoute = await import("@/app/api/auth/login/route");
    captchaRoute = await import("@/app/api/captcha/challenge/route");
    pushRoute = await import("@/app/api/sync/push/route");
    pullRoute = await import("@/app/api/sync/pull/route");
    historyRoute = await import("@/app/api/sync/history/route");
  });

  afterAll(async () => {
    if (shouldSkip) {
      return;
    }

    await dbModule?.closeDb();
    await container?.stop();
    if (storageRoot) {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it("allows a full registration, verification, login, and sync cycle", async () => {
    if (shouldSkip) {
       
      console.warn("Auth and sync flow test skipped because Docker is unavailable.");
      return;
    }

    const captchaResponse = await captchaRoute.POST();
    const captchaBody = await captchaResponse.json();
    const captchaAnswer = solveChallenge(captchaBody.challenge.question);

    const registerRequest = buildJsonRequest("http://localhost/api/auth/register", {
      email: "test@example.com",
      password: "StrongPass123",
      captchaId: captchaBody.challenge.id,
      captchaAnswer,
    });

    const registerResponse = await registerRoute.POST(registerRequest);
    expect(registerResponse.status).toBe(201);
    const registerBody = await registerResponse.json();
    expect(registerBody.requiresVerification).toBe(true);
    expect(registerBody.verificationToken).toBeDefined();

    const verifyRequest = buildJsonRequest("http://localhost/api/auth/verify-email", {
      token: registerBody.verificationToken,
    });

    const verifyResponse = await verifyRoute.POST(verifyRequest);
    expect(verifyResponse.status).toBe(200);

    const loginCaptchaResponse = await captchaRoute.POST();
    const loginCaptcha = await loginCaptchaResponse.json();
    const loginCaptchaAnswer = solveChallenge(loginCaptcha.challenge.question);

    const loginRequest = buildJsonRequest(
      "http://localhost/api/auth/login",
      {
        email: "test@example.com",
        password: "StrongPass123",
        captchaId: loginCaptcha.challenge.id,
        captchaAnswer: loginCaptchaAnswer,
      },
      {
        "user-agent": "jest-test-suite",
      }
    );

    const loginResponse = await loginRoute.POST(loginRequest);
    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json();
    token = loginBody.token;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    const now = new Date().toString();

    const pushRequest = buildJsonRequest(
      "http://localhost/api/sync/push",
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

    const pushResponse = await pushRoute.POST(pushRequest);
    expect(pushResponse.status).toBe(200);
    const pushBody = await pushResponse.json();
    expect(pushBody.cursor).toBe(1);
    expect(pushBody.snapshot.annotations["annotation-1"]).toMatchObject({
      id: "annotation-1",
      data: { label: "Important", value: 1 },
    });

    const pullRequest = buildGetRequest("http://localhost/api/sync/pull?cursor=0", {
      Authorization: `Bearer ${token}`,
    });
    const pullResponse = await pullRoute.GET(pullRequest);
    expect(pullResponse.status).toBe(200);
    const pullBody = await pullResponse.json();
    expect(pullBody.cursor).toBe(1);
    expect(pullBody.snapshot.annotations["annotation-1"].data.value).toBe(1);
    expect(pullBody.changes).toHaveLength(1);

    const historyRequest = buildGetRequest("http://localhost/api/sync/history", {
      Authorization: `Bearer ${token}`,
    });
    const historyResponse = await historyRoute.GET(historyRequest);
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    expect(historyBody.history).toHaveLength(1);
    expect(historyBody.history[0].summary).toBe("Initial sync");
  });
});
