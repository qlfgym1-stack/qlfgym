const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/auth');
  await page.waitForTimeout(2000);
  const receptionTab = page.locator('button:has-text("Réception")');
  if (await receptionTab.count() > 0) {
    await receptionTab.click();
    await page.waitForTimeout(1000);
  }
  await page.fill('input[name="identifier"]', 'moussamohamedelmabrouk@gmail.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const state = await page.context().storageState();
  const fs = require('fs');
  fs.writeFileSync('e2e/storageState.json', JSON.stringify(state, null, 2));
  console.log('Storage state saved!');
  await browser.close();
})();
