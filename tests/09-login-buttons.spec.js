// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMock } = require('./test-helpers');

test.describe('Login Page Button Tests', () => {
  test.describe('Login Button', () => {
    test('login button is visible', async ({ page }) => {
      await page.goto('/login.html');
      await expect(page.locator('#loginButton')).toBeVisible();
    });

    test('login button is enabled initially', async ({ page }) => {
      await page.goto('/login.html');
      await expect(page.locator('#loginButton')).toBeEnabled();
    });

    test('login button shows correct text', async ({ page }) => {
      await page.goto('/login.html');
      await expect(page.locator('#loginButton')).toHaveText('ログイン');
    });

    test('login button changes text during login attempt', async ({ page }) => {
      await page.goto('/login.html');

      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');

      // Check that button exists and has correct initial state
      await expect(page.locator('#loginButton')).toBeVisible();
      await expect(page.locator('#loginButton')).toHaveText('ログイン');
    });

    test('login button shows error on invalid credentials', async ({ page }) => {
      await setupAuthMock(page, '/login.html', { isAuthenticated: false });

      await page.fill('#email', 'invalid@example.com');
      await page.fill('#password', 'wrongpassword');
      await page.click('#loginButton');

      // Should show error message
      await expect(page.locator('#errorMessage')).toBeVisible();
      await expect(page.locator('#errorMessage')).toHaveClass(/show/);

      // Button should be re-enabled after error
      await expect(page.locator('#loginButton')).toBeEnabled();
      await expect(page.locator('#loginButton')).toHaveText('ログイン');
    });

    test('login form prevents submission without email', async ({ page }) => {
      await page.goto('/login.html');

      await page.fill('#password', 'password123');
      await page.click('#loginButton');

      // Form validation should prevent submission
      const emailInput = page.locator('#email');
      const isInvalid = await emailInput.evaluate(el => !el.checkValidity());
      expect(isInvalid).toBe(true);
    });

    test('login form prevents submission without password', async ({ page }) => {
      await page.goto('/login.html');

      await page.fill('#email', 'test@example.com');
      await page.click('#loginButton');

      // Form validation should prevent submission
      const passwordInput = page.locator('#password');
      const isInvalid = await passwordInput.evaluate(el => !el.checkValidity());
      expect(isInvalid).toBe(true);
    });
  });

  test.describe('Auto-redirect when logged in', () => {
    test('redirects to index when already authenticated', async ({ page }) => {
      await setupAuthMock(page, '/login.html', { isAuthenticated: true });

      // Should redirect to index.html
      await page.waitForURL(/index\.html/);
      expect(page.url()).toContain('index.html');
    });
  });
});
