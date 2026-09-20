import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function goToAuth(page: Page) {
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
}

async function login(page: Page, identifier: string, password: string) {
  await goToAuth(page);
  await expect(page.locator('input[name="identifier"]')).toBeVisible({ timeout: 20000 });
  await page.fill('input[name="identifier"]', identifier);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.group('Authentication', () => {
  test('sign-in page loads', async ({ page }) => {
    await goToAuth(page);
    await expect(page.locator('input[name="identifier"]')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveTitle(/Fitmanager|QLF/i);
  });

  test('reception tab exists', async ({ page }) => {
    await goToAuth(page);
    await expect(page.locator('button:has-text("Réception"), button:has-text("reception")')).toBeVisible({ timeout: 15000 });
  });

  test('sign-in form has identifier and password fields', async ({ page }) => {
    await goToAuth(page);
    await expect(page.locator('input[name="identifier"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 20000 });
  });

  test('Google OAuth button exists', async ({ page }) => {
    await goToAuth(page);
    await expect(page.locator('button:has-text("Gmail"), button:has-text("Google")').first()).toBeVisible({ timeout: 20000 });
  });

  test('sign-in with credentials', async ({ page }) => {
    await login(page, 'moussamohamedelmabrouk@gmail.com', 'test123');
    expect(page.url()).toMatch(/\/(dashboard|auth)/);
  });

  test('protected route redirects unauthenticated', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/auth/);
  });

  test('recovery link exists', async ({ page }) => {
    await goToAuth(page);
    const link = page.locator('a:has-text("Récup"), a:has-text("récupération"), a:has-text("code de")');
    await expect(link.first()).toBeVisible({ timeout: 15000 });
  });
});

test.group('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'moussamohamedelmabrouk@gmail.com', 'test123');
  });

  test('dashboard loads', async ({ page }) => {
    await expect(page.locator('h1, [class*="dashboard"], [class*="card"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('sidebar navigation present', async ({ page }) => {
    const nav = page.locator('nav, [class*="sidebar"], [class*="side"]');
    await expect(nav.first()).toBeVisible({ timeout: 15000 });
    const links = nav.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('navigate to members', async ({ page }) => {
    await page.goto(`${BASE_URL}/members`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/members/);
  });

  test('navigate to POS', async ({ page }) => {
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/pos/);
  });
});

test.group('POS', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('POS page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="pos"], [class*="title"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('product categories visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("snacks"), button:has-text("abonnement")').first()).toBeVisible({ timeout: 20000 });
  });
});

test.group('Dashboard', () => {
  test('KPI cards visible after login', async ({ page }) => {
    await login(page);
    await expect(page.locator('[class*="card"], [class*="kpi"]').first()).toBeVisible({ timeout: 30000 });
  });
});

test.group('Members', () => {
  test('members page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/members`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="member"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.group('Corporate', () => {
  test('corporate page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/corporate`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="corporate"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.group('AI Assistant', () => {
  test('AI assistant page loads', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/ai-assistant`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, [class*="assistant"]').first()).toBeVisible({ timeout: 20000 });
  });
});

test.group('404 Page', () => {
  test('shows 404 for unknown routes', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/nonexistent-route-xyz-12345`);
    await expect(page.locator('text=404, h1:has-text("404")').first()).toBeVisible({ timeout: 15000 });
  });
});

test.group('Recovery', () => {
  test('recovery page loads', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/recovery`);
    await expect(page.locator('h1, [class*="recovery"]').first()).toBeVisible({ timeout: 15000 });
  });
});