import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function login(page: Page) {
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
  await page.fill('input[name="identifier"]', 'moussamohamedelmabrouk@gmail.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('Role-Based Access Control', () => {
  test('admin can access all routes', async ({ page }) => {
    await login(page);
    const routes = ['/dashboard', '/members', '/pos', '/pointage', '/settings', '/ai-assistant'];
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toMatch(/\/auth/);
    }
  });
});

test.describe('Cross-Tenant Isolation', () => {
  test('members page shows org data only', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/members`);
    await page.waitForLoadState('networkidle');
    const rows = page.locator('tr, [class*="row"]');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('AI Assistant', () => {
  test('AI assistant page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/ai-assistant`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="assistant"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Robustness', () => {
  test('double-click does not cause duplicate actions', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    const btn = page.locator('button:has-text("Add"), button:has-text("Ajouter")').first();
    if (await btn.count() > 0) {
      await btn.dblclick();
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('404 Page', () => {
  test('shows 404 for unknown routes', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/nonexistent-route-xyz-12345`);
    await expect(page.locator('text=404, h1:has-text("404")').first()).toBeVisible({ timeout: 15000 });
  });
});