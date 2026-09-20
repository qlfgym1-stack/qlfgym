import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function login(page: Page, identifier: string = 'moussamohamedelmabrouk@gmail.com', password: string = 'test123') {
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const receptionTab = page.locator('button:has-text("Réception"), button:has-text("reception")');
  if (await receptionTab.count() > 0) {
    await receptionTab.click();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('input[name="identifier"]')).toBeVisible({ timeout: 20000 });
  await page.fill('input[name="identifier"]', identifier);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('POS / Checkout', () => {
  test('POS page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="pos"], [class*="title"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('product categories visible', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("snacks"), button:has-text("abonnement")').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Corporate Discount', () => {
  test('corporate page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/corporate`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="corporate"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Payments', () => {
  test('payments page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/payments`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="payment"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Attendance', () => {
  test('attendance page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/pointage`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="pointage"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Financial', () => {
  test('accounting page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/assistant-comptable`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="comptable"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('profitability page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/rentabilite`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="rentabilite"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('expenses page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/expenses`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="expenses"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('reports page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/reports`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="report"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="settings"]').first()).toBeVisible({ timeout: 20000 });
  });
});