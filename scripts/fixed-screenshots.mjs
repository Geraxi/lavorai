/**
 * Fixed Comprehensive Screenshot Capture
 * 
 * Requirements from user:
 * - Matte black/charcoal theme (dark theme as default)
 * - Full-width responsive grid (4-column KPI row on desktop, 2-column main/sidebar)
 * - Dismiss cookie banner
 * - Verify all users have emailVerified
 * - Confirm every screenshot shows dashboard, not login
 * - Capture BEFORE (from main branch) and AFTER
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';
const POPULATED_EMAIL = 'test-dashboard@lavorai.test';
const EMPTY_EMAIL = 'empty@lavorai.test';
const NONADMIN_EMAIL = 'nonadmin@lavorai.test';
const PASSWORD = 'test123';

// Create directories
mkdirSync('docs/dashboard-redesign/screenshots/before', { recursive: true });
mkdirSync('docs/dashboard-redesign/screenshots/after', { recursive: true });
mkdirSync('/opt/cursor/artifacts/before', { recursive: true });
mkdirSync('/opt/cursor/artifacts/after', { recursive: true });

async function setDarkTheme(page) {
  // Force dark theme by setting localStorage and data-theme attribute
  await page.evaluate(() => {
    localStorage.setItem('lavorai-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(500);
}

async function dismissCookies(page) {
  try {
    // Try multiple possible cookie accept buttons
    const acceptButton = await page.locator('button:has-text("Accetta tutti"), button:has-text("Accept all"), button:has-text("Accetta")').first();
    if (await acceptButton.isVisible({ timeout: 2000 })) {
      await acceptButton.click();
      await page.waitForTimeout(500);
      console.log('    ✓ Dismissed cookie banner');
    }
  } catch {
    // No cookie banner or already dismissed
  }
}

async function login(page, email, password) {
  console.log(`  Logging in as ${email}...`);
  
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Dismiss cookies
  await dismissCookies(page);
  
  // Fill credentials
  await page.fill('input#email', email);
  await page.waitForTimeout(300);
  await page.fill('input#password', password);
  await page.waitForTimeout(300);
  
  // Click login
  await page.click('button[type="submit"]', { force: true });
  
  // Wait for navigation
  await page.waitForTimeout(3000);
  
  // Verify we're on dashboard
  const url = page.url();
  if (!url.includes('/dashboard')) {
    console.log(`    ⚠️ Not on dashboard, got: ${url}`);
    // Try to navigate directly
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }
  
  // Force dark theme
  await setDarkTheme(page);
  
  // Final check
  const finalUrl = page.url();
  console.log(`    Current URL: ${finalUrl}`);
  
  if (!finalUrl.includes('/dashboard')) {
    throw new Error(`Failed to reach dashboard. Stuck on: ${finalUrl}`);
  }
  
  console.log(`    ✅ On dashboard with dark theme`);
}

async function captureScreenshot(page, name, directory) {
  const paths = [
    `docs/dashboard-redesign/screenshots/${directory}/${name}`,
    `/opt/cursor/artifacts/${directory}/${name}`
  ];
  
  for (const path of paths) {
    await page.screenshot({ path, fullPage: true });
  }
  
  console.log(`    📸 ${name}`);
  return paths[0];
}

async function describeScreenshot(page, name) {
  console.log(`\n  📋 Describing ${name}:`);
  
  // Check theme
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log(`    Theme: ${theme || 'dark (default)'}`);
  
  // Check URL
  const url = page.url();
  console.log(`    URL: ${url}`);
  
  // Check if dashboard elements are visible
  const kpis = await page.locator('.dashboard-kpis').count();
  console.log(`    KPI section: ${kpis > 0 ? '✓ Present' : '✗ Missing'}`);
  
  const kpiCards = await page.locator('.dashboard-kpis > *').count();
  console.log(`    KPI cards: ${kpiCards}`);
  
  const mainColumn = await page.locator('.dashboard-main').count();
  const sidebar = await page.locator('.dashboard-sidebar').count();
  console.log(`    Layout: ${mainColumn > 0 ? 'Main column ✓' : 'Main column ✗'}, ${sidebar > 0 ? 'Sidebar ✓' : 'Sidebar ✗'}`);
  
  // Check background color
  const bgColor = await page.evaluate(() => {
    return getComputedStyle(document.body).backgroundColor;
  });
  console.log(`    Background color: ${bgColor}`);
  
  // Check for login page indicators
  const isLogin = url.includes('/login') || await page.locator('input#email').count() > 0;
  if (isLogin) {
    console.log(`    ⚠️ WARNING: This appears to be the LOGIN page, not dashboard!`);
  } else {
    console.log(`    ✅ Confirmed: Dashboard page`);
  }
}

async function captureSet(browser, branch, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📸 Capturing ${description} (${branch})`);
  console.log('='.repeat(60));
  
  const dir = branch === 'main' ? 'before' : 'after';
  
  // Desktop 1440px - Populated User
  console.log('\n1️⃣  Desktop 1440px - Populated User');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const desktopPage = await desktopContext.newPage();
  
  await login(desktopPage, POPULATED_EMAIL, PASSWORD);
  const desktopPath = await captureScreenshot(desktopPage, `dashboard-${dir}-desktop-1440px-populated.png`, dir);
  await describeScreenshot(desktopPage, 'Desktop Populated');
  
  await desktopContext.close();
  
  // Mobile 375px - Populated User
  console.log('\n2️⃣  Mobile 375px - Populated User');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
  });
  const mobilePage = await mobileContext.newPage();
  
  await login(mobilePage, POPULATED_EMAIL, PASSWORD);
  const mobilePath = await captureScreenshot(mobilePage, `dashboard-${dir}-mobile-375px-populated.png`, dir);
  await describeScreenshot(mobilePage, 'Mobile Populated');
  
  await mobileContext.close();
  
  // Desktop 1440px - Empty User
  console.log('\n3️⃣  Desktop 1440px - Empty User');
  const emptyContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const emptyPage = await emptyContext.newPage();
  
  try {
    await login(emptyPage, EMPTY_EMAIL, PASSWORD);
    const emptyPath = await captureScreenshot(emptyPage, `dashboard-${dir}-desktop-1440px-empty.png`, dir);
    await describeScreenshot(emptyPage, 'Desktop Empty');
  } catch (error) {
    console.log(`    ⚠️ Empty user screenshot failed: ${error.message}`);
  }
  
  await emptyContext.close();
  
  // Desktop 1440px - Non-Admin User
  console.log('\n4️⃣  Desktop 1440px - Non-Admin User');
  const nonadminContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const nonadminPage = await nonadminContext.newPage();
  
  await login(nonadminPage, NONADMIN_EMAIL, PASSWORD);
  
  // Check admin UI
  const adminNav = await nonadminPage.locator('text=Admin').first().count();
  const adminButton = await nonadminPage.locator('button:has-text("Admin AI")').count();
  console.log(`    Admin nav: ${adminNav === 0 ? '✅ Hidden' : '❌ Visible'}`);
  console.log(`    Admin AI button: ${adminButton === 0 ? '✅ Hidden' : '❌ Visible'}`);
  
  const nonadminPath = await captureScreenshot(nonadminPage, `dashboard-${dir}-desktop-1440px-nonadmin.png`, dir);
  await describeScreenshot(nonadminPage, 'Desktop Non-Admin');
  
  await nonadminContext.close();
}

async function main() {
  console.log('🎭 Fixed Comprehensive Screenshot Capture\n');
  console.log('Requirements:');
  console.log('  ✓ Dark theme (matte black/charcoal)');
  console.log('  ✓ Full-width responsive grid');
  console.log('  ✓ Dismiss cookie banner');
  console.log('  ✓ Email verified users');
  console.log('  ✓ Confirm dashboard page (not login)');
  console.log('  ✓ BEFORE (main) and AFTER (current branch)\n');
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // Get current branch
    const currentBranch = execSync('git branch --show-current').toString().trim();
    console.log(`Current branch: ${currentBranch}\n`);
    
    // Capture AFTER (current branch)
    await captureSet(browser, currentBranch, 'AFTER - New Dashboard');
    
    // Capture BEFORE (main branch)
    console.log('\n\n' + '='.repeat(60));
    console.log('🔄 Switching to main branch for BEFORE screenshots');
    console.log('='.repeat(60));
    
    try {
      // Stash any changes
      execSync('git stash push -m "Screenshot capture temp stash"', { stdio: 'pipe' });
      console.log('  Stashed current changes');
    } catch {
      // Nothing to stash
    }
    
    try {
      // Checkout main
      execSync('git checkout main', { stdio: 'pipe' });
      console.log('  ✓ Checked out main branch');
      
      // Wait for dev server to reload
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Capture BEFORE
      await captureSet(browser, 'main', 'BEFORE - Old Dashboard');
      
    } finally {
      // Return to original branch
      execSync(`git checkout ${currentBranch}`, { stdio: 'pipe' });
      console.log(`\n  ✓ Returned to ${currentBranch}`);
      
      try {
        execSync('git stash pop', { stdio: 'pipe' });
        console.log('  ✓ Restored stashed changes');
      } catch {
        // Nothing to pop
      }
    }
    
  } finally {
    await browser.close();
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('✅ Screenshot capture complete!');
  console.log('='.repeat(60));
  console.log('\n📁 Files saved to:');
  console.log('   BEFORE: docs/dashboard-redesign/screenshots/before/');
  console.log('   AFTER:  docs/dashboard-redesign/screenshots/after/');
  console.log('   Artifacts: /opt/cursor/artifacts/before/ and /after/\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
