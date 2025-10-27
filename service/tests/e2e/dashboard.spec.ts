import { test, expect } from "@playwright/test";

import { solveCaptchaQuestion } from "./utils";

type CaptchaResponse = {
  challenge: {
    id: string;
    question: string;
    expiresAt: string;
  };
};

type RegisterResponse = {
  message: string;
  requiresVerification: boolean;
  verificationToken?: string;
};

type LoginResponse = {
  token: string;
  expiresAt: string | null;
  user: {
    id: string;
    email: string;
    emailVerifiedAt: string | null;
  };
};

const baseUrlEnv =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? "4010"}`;
const { hostname: serviceHostname } = new URL(baseUrlEnv);

test.describe("Dashboard", () => {
  test("renders sync history and snapshot for a verified user", async ({ page, request }) => {
    const timestamp = Date.now();
    const email = `dash-${timestamp}@example.com`;
    const password = "StrongPass123";
    const annotationId = `anno-${timestamp}`;
    const now = new Date().toISOString();

    const captchaForRegister = await request.post("/api/captcha/challenge");
    expect(captchaForRegister.ok()).toBeTruthy();
    const registerChallenge = (await captchaForRegister.json()) as CaptchaResponse;
    const registerAnswer = solveCaptchaQuestion(registerChallenge.challenge.question);

    const registerResponse = await request.post("/api/auth/register", {
      data: {
        email,
        password,
        captchaId: registerChallenge.challenge.id,
        captchaAnswer: registerAnswer,
      },
      headers: {
        "content-type": "application/json",
      },
    });
    expect(registerResponse.ok()).toBeTruthy();
    const registerBody = (await registerResponse.json()) as RegisterResponse;
    expect(registerBody.requiresVerification).toBeTruthy();
    expect(registerBody.verificationToken).toBeDefined();

    const verificationToken = registerBody.verificationToken as string;

    await page.goto(`/verify-email?token=${verificationToken}`);
    await expect(
      page.getByText(`Email ${email} verified successfully.`)
    ).toBeVisible();

    const captchaForLogin = await request.post("/api/captcha/challenge");
    expect(captchaForLogin.ok()).toBeTruthy();
    const loginChallenge = (await captchaForLogin.json()) as CaptchaResponse;
    const loginAnswer = solveCaptchaQuestion(loginChallenge.challenge.question);

    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email,
        password,
        captchaId: loginChallenge.challenge.id,
        captchaAnswer: loginAnswer,
      },
      headers: {
        "content-type": "application/json",
        "user-agent": "playwright-dashboard-test",
      },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginBody = (await loginResponse.json()) as LoginResponse;

    await page.context().addCookies([
      {
        name: "myz_session",
        value: loginBody.token,
        domain: serviceHostname,
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const pushResponse = await request.post("/api/sync/push", {
      data: {
        cursor: 0,
        changes: [
          {
            id: annotationId,
            type: "create",
            payload: {
              title: "Dashboard highlight",
              tags: ["myz", "playwright"],
            },
            updatedAt: now,
          },
        ],
        summary: "Dashboard e2e sync",
      },
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${loginBody.token}`,
      },
    });
    expect(pushResponse.ok()).toBeTruthy();

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Recent sync runs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest snapshot" })).toBeVisible();
    await expect(page.getByText("Dashboard e2e sync")).toBeVisible();
    await expect(page.getByText("Email verified")).toBeVisible();
    await expect(page.locator("pre").first()).toContainText(annotationId);

    await request.post("/api/auth/logout", {
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${loginBody.token}`,
      },
    });
  });
});
