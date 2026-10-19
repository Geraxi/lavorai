/**
 * Capture Non-Admin Screenshot
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const NON_ADMIN_EMAIL = 'nonadmin@lavorai.test';
const PASSWORD = 'test123';

mkdirSync('docs/dashboard-redesign/screenshots/after', { recursive: true });
mkdirSync('/opt/cursor/artifacts/after', { recursive: true });

async function login(page, email, password) {
  console.log(`Logging in as ${email}...`);
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  
  try {
    await page.click('button:has-text("Accetta tutti")', { timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {}
  
  await page.fill('input#email', email);
  await page.waitForTimeout(300);
  await page.fill('input#password', password);
  await page.waitForTimeout(300);
  
  await page.click('button[type="submit"]', { force: true });
  
  try {
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  } catch {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  }
  
  await page.waitForTimeout(3000);
  
  console.log(`Current URL: ${page.url()}`);
  console.log('✅ Logged in successfully');
}

async function main() {
  console.log('📸 Capturing Non-Admin Screenshot\n');
  
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  
  await login(page, NON_ADMIN_EMAIL, PASSWORD);
  
  // Check admin UI
  const adminNav = await page.locator('text=Admin').first().count();
  const adminButton = await page.locator('button:has-text("Admin AI")').count();
  
  console.log(`\nAdmin UI Check:`);
  console.log(`  Admin nav: ${adminNav === 0 ? '✅ Hidden' : '❌ Visible (ERROR!)'}`);
  console.log(`  Admin AI button: ${adminButton === 0 ? '✅ Hidden' : '❌ Visible (ERROR!)'}`);
  
  // Take screenshot
  const paths = [
    'docs/dashboard-redesign/screenshots/after/dashboard-after-desktop-1440px-nonadmin.png',
    '/opt/cursor/artifacts/after/dashboard-after-desktop-1440px-nonadmin.png'
  ];
  
  for (const path of paths) {
    await page.screenshot({ path, fullPage: true });
  }
  
  console.log(`\n✅ Screenshot saved!`);
  
  await browser.close();
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
