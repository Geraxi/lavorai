/**
 * Dashboard Screenshot Capture - Final Version
 * Captures BEFORE (main) and AFTER (this branch) screenshots
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SCREENSHOT_DIR = path.join(process.cwd(), "docs/dashboard-redesign/screenshots");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const BASE_URL = "http://localhost:3000";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, name: "desktop-1440px" },
  tablet: { width: 768, height: 1024, name: "tablet-768px" },
  mobile: { width: 375, height: 812, name: "mobile-375px" },
};

const TEST_USERS = {
  populated: { email: "test-dashboard@lavorai.test", password: "test123", name: "populated" },
  empty: { email: "test-empty@lavorai.test", password: "test123", name: "empty" },
  nonadmin: { email: "test-nonadmin@lavorai.test", password: "test123", name: "nonadmin" },
};

async function login(page: Page, user: typeof TEST_USERS.populated): Promise<void> {
  console.log(`  🔐 Logging in as ${user.email}...`);
  
  // Use test auth API to create session
  const response = await page.request.post(`${BASE_URL}/api/test-auth`, {
    data: { email: user.email },
  });
  
  if (!response.ok()) {
    throw new Error(`Test auth failed: ${response.status()}`);
  }
  
  // Navigate to home to pick up the session cookie
  await page.goto(BASE_URL);
  
  // Pre-set localStorage (cookie consent, dark theme)
  await page.evaluate(() => {
    localStorage.setItem("cookie-consent", "true");
    localStorage.setItem("lavorai-theme", "dark");
  });
  
  // Navigate to dashboard
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState("networkidle");
  
  // Verify we're on the dashboard
  const url = page.url();
  if (!url.includes("/dashboard")) {
    throw new Error(`Not on dashboard: ${url}`);
  }
  
  console.log("  ✅ Logged in");
}

async function captureScreenshot(
  page: Page,
  name: string,
  user: string,
  viewport: typeof VIEWPORTS[keyof typeof VIEWPORTS],
  branch: "before" | "after"
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  
  // Navigate to dashboard
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState("networkidle");
  
  // Wait for dashboard content
  await page.waitForSelector(".dashboard-redesign, main", { timeout: 10000 });
  await page.waitForTimeout(2000); // Wait for animations
  
  // Capture screenshot
  const filename = `dashboard-${branch}-${viewport.name}-${user}.png`;
  const screenshotPath = path.join(SCREENSHOT_DIR, branch, filename);
  const artifactPath = path.join(ARTIFACTS_DIR, filename);
  
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  
  // Also save to artifacts
  try {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({
      path: artifactPath,
      fullPage: true,
    });
  } catch (err) {
    // Artifacts dir may not be writable
  }
  
  console.log(`    📸 ${filename}`);
}

async function captureForBranch(browser: Browser, branch: "before" | "after"): Promise<void> {
  console.log(`\n📸 Capturing ${branch.toUpperCase()} screenshots...\n`);
  
  // Create new context for each user to avoid cookie conflicts
  for (const [userKey, user] of Object.entries(TEST_USERS)) {
    console.log(`\n  User: ${user.name} (${user.email})`);
    
    const context = await browser.newContext({
      viewport: VIEWPORTS.desktop,
    });
    const page = await context.newPage();
    
    try {
      await login(page, user);
      
      // Desktop 1440px
      console.log(`    Desktop 1440px:`);
      await captureScreenshot(page, user.name, user.name, VIEWPORTS.desktop, branch);
      
      // Tablet 768px (only for populated user)
      if (userKey === "populated") {
        console.log(`    Tablet 768px:`);
        await captureScreenshot(page, user.name, user.name, VIEWPORTS.tablet, branch);
      }
      
      // Mobile 375px (only for populated user)
      if (userKey === "populated") {
        console.log(`    Mobile 375px:`);
        await captureScreenshot(page, user.name, user.name, VIEWPORTS.mobile, branch);
      }
    } catch (error) {
      console.error(`    ❌ Error capturing for ${user.name}:`, error);
    } finally {
      await context.close();
    }
  }
}

async function main() {
  console.log("🎬 Dashboard Screenshot Capture - Final\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test users: ${Object.keys(TEST_USERS).length}`);
  
  // Create directories
  await mkdir(path.join(SCREENSHOT_DIR, "before"), { recursive: true });
  await mkdir(path.join(SCREENSHOT_DIR, "after"), { recursive: true });
  
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  
  try {
    // Capture AFTER (current branch)
    await captureForBranch(browser, "after");
    
    console.log("\n✅ Screenshot capture complete!\n");
    console.log(`📁 Screenshots saved to:`);
    console.log(`   - ${SCREENSHOT_DIR}/after/`);
    
    console.log("\n⚠️  BEFORE screenshots:");
    console.log("   To capture BEFORE, checkout main and run this script again");
    
  } catch (error) {
    console.error("\n❌ Capture failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
