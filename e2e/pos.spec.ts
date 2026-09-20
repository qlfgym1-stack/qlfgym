import { test, expect } from '@playwright/test';

test.describe('POS / Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'moussamohamedelmabrouk@gmail.com');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto('/pos');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('POS page loads', async ({ page }) => {
    await expect(page.locator('text=POS, h1:has-text("POS"), [data-testid="pos"]')).toBeVisible();
  });

  test('product categories are visible', async ({ page }) => {
    const tabs = page.locator('button:has-text("snacks"), button:has-text("boissons"), button:has-text("abonnement")');
    await expect(tabs.first()).toBeVisible();
  });

  test('checkout button exists', async ({ page }) => {
    const btn = page.locator('button:has-text("Checkout"), button:has-text("CAISSE"), button:has-text("Payer")');
    await expect(btn.first()).toBeVisible();
  });

  test('cart panel opens', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), .card').first();
    await addBtn.click();
    await expect(page.locator('text=Panier, text=Cart, [class*="cart"]')).toBeVisible();
  });

  test('corporate discount display', async ({ page }) => {
    const discount = page.locator('text=Remise, text=Discount, text=Remise convention');
    await expect(discount.first()).toBeVisible();
  });

  test('subscription item in cart', async ({ page }) => {
    const subItem = page.locator('text=Abonnement, text=Subscription, text=Renouvellement');
    await expect(subItem.first()).toBeVisible();
  });
});

test.describe('Customer Journey', () => {
  test('create member flow', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'moussamohamedelmabrouk@gmail.com');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto('/members');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('text=Membres, h1:has-text("Membres"), [data-testid="members"]')).toBeVisible();
  });

  test('add member form works', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'moussamohamedelmabrouk@gmail.com');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto('/members');
    await page.waitForLoadState('networkidle').catch(() => {});
    const addBtn = page.locator('button:has-text("Ajouter"), button:has-text("Add"), [data-testid="add-member"]');
    await addBtn.first().click();
    await expect(page.locator('input[name="first_name"], input[placeholder*="Prénom"]')).toBeVisible();
  });

  test('subscription flow', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'moussamohamedelmabrouk@gmail.com');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto('/members');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('text=Membres, h1:has-text("Membres")')).toBeVisible();
  });
});

test.describe('Attendance', () => {
  test('attendance page accessible', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'moussamohamedelmabrouk@gmail.com');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.goto('/pointage');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('text=Pointage, h1:has-text("Pointage"), [data-testid="attendance"]')).toBeVisible();
  });
});