/**
 * Simple Screenshot Capture - No Auth Required
 * Takes screenshots of current dashboard state for visual verification
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SCREENSHOT_DIR = path.join(process.cwd(), "docs/dashboard-redesign/screenshots/after");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("📸 Simple Screenshot Capture\n");
  
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await mkdir(ARTIFACTS_DIR, { recursive: true }).catch(() => {});
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  
  // Set dark theme via localStorage before navigating
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.setItem("lavorai-theme", "dark");
    localStorage.setItem("cookie-consent", "true");
  });
  
  console.log("Capturing dashboard at http://localhost:3000/dashboard...");
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForTimeout(3000);
  
  // Take screenshot of whatever is rendered
  const filename = "dashboard-current-state.png";
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  });
  
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, filename),
    fullPage: true,
  }).catch(() => {});
  
  console.log(`✅ Screenshot saved: ${filename}`);
  console.log(`   ${SCREENSHOT_DIR}/${filename}`);
  
  await browser.close();
}

main().catch(console.error);
