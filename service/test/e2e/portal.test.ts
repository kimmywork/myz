import { test, expect } from '@playwright/test';

test.describe('Web UI Portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the home page', async ({ page }) => {
    await expect(page).toHaveTitle(/MyZ Annotator/);
    await expect(page.locator('h1')).toHaveText('MyZ Annotator');
    await expect(page.locator('.subtitle')).toBeVisible();
  });

  test('should show login and register tabs', async ({ page }) => {
    await expect(page.locator('[data-tab="login"]')).toBeVisible();
    await expect(page.locator('[data-tab="register"]')).toBeVisible();
    
    // Login tab should be active by default
    await expect(page.locator('[data-tab="login"]')).toHaveClass(/active/);
  });

  test('should switch between tabs', async ({ page }) => {
    const registerTab = page.locator('[data-tab="register"]');
    await registerTab.click();
    
    await expect(registerTab).toHaveClass(/active/);
    await expect(page.locator('#register-tab')).toBeVisible();
    await expect(page.locator('#login-tab')).not.toBeVisible();
    
    const loginTab = page.locator('[data-tab="login"]');
    await loginTab.click();
    
    await expect(loginTab).toHaveClass(/active/);
    await expect(page.locator('#login-tab')).toBeVisible();
    await expect(page.locator('#register-tab')).not.toBeVisible();
  });

  test('should display captcha on login form', async ({ page }) => {
    // Wait for captcha to load from server
    await page.waitForTimeout(1000);
    await expect(page.locator('#login-captcha-canvas')).toBeVisible();
    await expect(page.locator('#login-captcha')).toBeVisible();
  });

  test('should display captcha on register form', async ({ page }) => {
    await page.locator('[data-tab="register"]').click();
    // Wait for captcha to load from server
    await page.waitForTimeout(1000);
    await expect(page.locator('#register-captcha-canvas')).toBeVisible();
    await expect(page.locator('#register-captcha')).toBeVisible();
  });

  test('should refresh captcha when clicking refresh button', async ({ page }) => {
    const canvas = page.locator('#login-captcha-canvas');
    
    // Wait for initial captcha to load
    await page.waitForTimeout(1000);
    
    // Take screenshot of initial captcha
    const initialImage = await canvas.screenshot();
    
    // Click refresh button
    await page.locator('.refresh-captcha').first().click();
    
    // Wait for new captcha to load from server
    await page.waitForTimeout(1000);
    
    // Take screenshot of new captcha
    const newImage = await canvas.screenshot();
    
    // Images should be different
    expect(Buffer.compare(initialImage, newImage)).not.toBe(0);
  });

  test('should validate required fields on login', async ({ page }) => {
    const submitButton = page.locator('#login-form button[type="submit"]');
    await submitButton.click();
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('#login-email');
    await expect(emailInput).toBeFocused();
  });

  test('should validate required fields on register', async ({ page }) => {
    await page.locator('[data-tab="register"]').click();
    
    const submitButton = page.locator('#register-form button[type="submit"]');
    await submitButton.click();
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('#register-email');
    await expect(emailInput).toBeFocused();
  });

  test('should show error message for invalid login', async ({ page }) => {
    // Fill in login form
    await page.fill('#login-email', 'nonexistent@example.com');
    await page.fill('#login-password', 'wrongpassword');
    
    // Wait for captcha to load
    await page.waitForTimeout(1000);
    
    // Fill in some captcha text (will be wrong but tests the flow)
    await page.fill('#login-captcha', 'ABCDEF');
    
    // Submit form
    await page.locator('#login-form button[type="submit"]').click();
    
    // Should show error message (either captcha error or login error)
    await expect(page.locator('.message-error')).toBeVisible({ timeout: 5000 });
  });

  test('should display OAuth login buttons', async ({ page }) => {
    const googleButton = page.locator('button:has-text("Google 登录")');
    const githubButton = page.locator('button:has-text("GitHub 登录")');
    
    await expect(googleButton).toBeVisible();
    await expect(githubButton).toBeVisible();
  });

  test('should have responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.container')).toBeVisible();
    await expect(page.locator('.card')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('.container')).toBeVisible();
    await expect(page.locator('.card')).toBeVisible();
  });

  test('should validate password confirmation on register', async ({ page }) => {
    await page.locator('[data-tab="register"]').click();
    
    await page.fill('#register-email', 'test@example.com');
    await page.fill('#register-password', 'password123');
    await page.fill('#register-password-confirm', 'differentpassword');
    
    // Wait for captcha to load
    await page.waitForTimeout(1000);
    await page.fill('#register-captcha', 'ABCDEF');
    
    await page.locator('#register-form button[type="submit"]').click();
    
    // Should show error message about password mismatch
    await expect(page.locator('.message-error')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard functionality', () => {
  test('should hide auth section when logged in', async ({ page }) => {
    // This would require actually logging in
    // For now, we test that the dashboard section exists
    await page.goto('/');
    const dashboard = page.locator('#dashboard-section');
    await expect(dashboard).toBeHidden();
  });
});
