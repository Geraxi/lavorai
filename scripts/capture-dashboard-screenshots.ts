/**
 * Dashboard Redesign Screenshot Capture
 * 
 * Captures BEFORE (main branch) and AFTER (this branch) screenshots at multiple viewports.
 * Logs in with test user, pre-sets cookie consent, captures full-page screenshots.
 * 
 * Run: npx tsx scripts/capture-dashboard-screenshots.ts
 * 
 * Prerequisites:
 * 1. Dev server running on http://localhost:3000
 * 2. Test database seeded: NODE_ENV=test npx tsx prisma/seed-dashboard-test.ts
 * 3. Test user: test-dashboard@lavorai.test (magic link login)
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SCREENSHOT_DIR = path.join(process.cwd(), "docs/dashboard-redesign/screenshots");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_USER_EMAIL = "test-dashboard@lavorai.test";

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, name: "desktop-1440px" },
  tablet: { width: 768, height: 1024, name: "tablet-768px" },
  mobile: { width: 375, height: 812, name: "mobile-375px" },
};

async function setupBrowser(): Promise<Browser> {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

async function loginTestUser(page: Page): Promise<void> {
  console.log(`  🔐 Logging in as ${TEST_USER_EMAIL}...`);
  
  // Navigate to auth page
  await page.goto(`${BASE_URL}/auth/signin`);
  
  // Pre-set cookie consent to avoid banner
  await page.evaluate(() => {
    localStorage.setItem("cookie-consent", "true");
    localStorage.setItem("lavorai-theme", "dark"); // Use dark theme
  });
  
  // For test environment, we might need to simulate a magic link login
  // or use a test-only backdoor. Check if there's a test login endpoint.
  // For now, let's try to set auth cookies directly if available.
  
  // Alternative: Use Prisma to generate a valid session token
  // For this script, we'll assume a test-only auth bypass exists
  // or we manually create a session cookie
  
  console.log("  ⚠️  Auth implementation needed - using test session cookie");
  
  // Set a test session cookie (you'll need to generate a valid one)
  // For now, we'll navigate to the dashboard and hope for the best
  await page.goto(`${BASE_URL}/dashboard`);
  
  // Check if we're redirected to auth
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes("/auth/")) {
    throw new Error("❌ Not authenticated - need to implement test user login");
  }
  
  console.log("  ✅ Logged in successfully");
}

async function captureScreenshot(
  page: Page,
  name: string,
  viewport: typeof VIEWPORTS[keyof typeof VIEWPORTS],
  branch: "before" | "after"
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(1000); // Wait for layout to settle
  
  // Wait for key elements to be visible
  await page.waitForSelector(".dashboard-redesign", { timeout: 10000 });
  
  // Wait for any animations to complete
  await page.waitForTimeout(2000);
  
  // Capture full page screenshot
  const filename = `dashboard-${branch}-${viewport.name}-${name}.png`;
  const screenshotPath = path.join(SCREENSHOT_DIR, branch, filename);
  const artifactPath = path.join(ARTIFACTS_DIR, filename);
  
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  
  // Also save to artifacts directory for PR embedding
  try {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({
      path: artifactPath,
      fullPage: true,
    });
  } catch (err) {
    console.log(`    ⚠️  Could not save to artifacts: ${err}`);
  }
  
  console.log(`    📸 ${filename}`);
}

async function captureAllStates(page: Page, branch: "before" | "after"): Promise<void> {
  console.log(`\n📸 Capturing ${branch.toUpperCase()} screenshots...\n`);
  
  // Navigate to dashboard
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState("networkidle");
  
  // Desktop 1440px - populated
  console.log("  Desktop 1440px (populated):");
  await captureScreenshot(page, "populated", VIEWPORTS.desktop, branch);
  
  // Tablet 768px - populated
  console.log("  Tablet 768px (populated):");
  await captureScreenshot(page, "populated", VIEWPORTS.tablet, branch);
  
  // Mobile 375px - populated
  console.log("  Mobile 375px (populated):");
  await captureScreenshot(page, "populated", VIEWPORTS.mobile, branch);
  
  // TODO: Empty user state (need to create empty test user or clear data)
  // TODO: Non-admin state (if admin UI is present)
}

async function main() {
  console.log("🎬 Dashboard Screenshot Capture\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test user: ${TEST_USER_EMAIL}\n`);
  
  // Create screenshot directories
  await mkdir(path.join(SCREENSHOT_DIR, "before"), { recursive: true });
  await mkdir(path.join(SCREENSHOT_DIR, "after"), { recursive: true });
  
  const browser = await setupBrowser();
  
  try {
    const page = await browser.newPage();
    
    // Login
    await loginTestUser(page);
    
    // Capture AFTER screenshots (current branch)
    await captureAllStates(page, "after");
    
    console.log("\n✅ Screenshot capture complete!\n");
    console.log(`📁 Screenshots saved to:`);
    console.log(`   - ${SCREENSHOT_DIR}/after/`);
    console.log(`   - ${ARTIFACTS_DIR}/\n`);
    
    console.log("⚠️  BEFORE screenshots:");
    console.log("   To capture BEFORE screenshots from main branch:");
    console.log("   1. Checkout main: git checkout main");
    console.log("   2. Install deps: npm install");
    console.log("   3. Seed test DB: NODE_ENV=test npx tsx prisma/seed-dashboard-test.ts");
    console.log("   4. Run this script again\n");
    
  } catch (error) {
    console.error("\n❌ Screenshot capture failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
