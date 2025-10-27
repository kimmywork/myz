import { test, expect } from "@playwright/test";

import { solveCaptchaQuestion } from "./utils";

test.describe("Auth portal", () => {
  test("register flow displays verification guidance", async ({ page }) => {
    const timestamp = Date.now();
    const email = `new-user-${timestamp}@example.com`;
    const password = "StrongPass123";

    await page.goto("/register");

    const questionLocator = page
      .locator("fieldset span")
      .filter({ hasText: "What" })
      .first();
    await expect(questionLocator).toBeVisible();

  const questionText = (await questionLocator.textContent())?.trim() ?? "";
  const captchaAnswer = solveCaptchaQuestion(questionText);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByPlaceholder("Answer").fill(captchaAnswer);
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByText("Verification required")).toBeVisible();
    await expect(page.getByText(/Development hint: verification token/)).toBeVisible();
  });

  test("login flow shows success state", async ({ page, request }) => {
    const timestamp = Date.now();
    const email = `verified-${timestamp}@example.com`;
    const password = "StrongPass123";

    const captchaResponse = await request.post("/api/captcha/challenge");
    expect(captchaResponse.ok()).toBeTruthy();
    const captchaBody = (await captchaResponse.json()) as {
      challenge: { id: string; question: string };
    };
    const registerAnswer = solveCaptchaQuestion(captchaBody.challenge.question);

    const registerResponse = await request.post("/api/auth/register", {
      data: {
        email,
        password,
        captchaId: captchaBody.challenge.id,
        captchaAnswer: registerAnswer,
      },
      headers: {
        "content-type": "application/json",
      },
    });
    expect(registerResponse.ok()).toBeTruthy();
    const registerBody = (await registerResponse.json()) as {
      verificationToken?: string;
    };

    expect(registerBody.verificationToken).toBeDefined();

    const verifyResponse = await request.post("/api/auth/verify-email", {
      data: { token: registerBody.verificationToken },
      headers: {
        "content-type": "application/json",
      },
    });
    expect(verifyResponse.ok()).toBeTruthy();

    await page.goto("/login");

    const questionLocator = page
      .locator("fieldset span")
      .filter({ hasText: "What" })
      .first();
    await expect(questionLocator).toBeVisible();

  const questionText = (await questionLocator.textContent())?.trim() ?? "";
  const captchaAnswer = solveCaptchaQuestion(questionText);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByPlaceholder("Answer").fill(captchaAnswer);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText("Login successful! Redirecting to dashboard...")
    ).toBeVisible();
  });

  test("verify email page surfaces backend errors", async ({ page }) => {
    const invalidToken = `bad-token-${Date.now()}`;

    await page.goto(`/verify-email?token=${invalidToken}`);

    await expect(page.locator("code")).toContainText(invalidToken);
    await expect(page.getByText(/Invalid or expired token/i)).toBeVisible();
  });
});
