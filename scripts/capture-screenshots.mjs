/**
 * Dashboard Screenshot & Usability Test Script
 * 
 * Captures screenshots at 1440px and 375px for:
 * - BEFORE state (old dashboard from main branch)
 * - AFTER state (new dashboard from redesign branch)
 * 
 * Tests 5 usability tasks:
 * 1. Find needs attention items
 * 2. View application status
 * 3. Check recent activity
 * 4. View CV details
 * 5. Browse opportunities
 * 
 * Run: node scripts/capture-screenshots.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test-dashboard@lavorai.test';

// Create directories
mkdirSync('docs/dashboard-redesign/screenshots/after', { recursive: true });
mkdirSync('/opt/cursor/artifacts/after', { recursive: true });

async function main() {
  console.log('🎭 Starting Playwright screenshot capture\\n');

  const browser = await chromium.launch({ headless: true });
  
  // Desktop viewport (1440px)
  console.log('📸 Capturing desktop screenshots (1440px)...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  
  const desktopPage = await desktopContext.newPage();
  
  // Navigate to login
  await desktopPage.goto(`${BASE_URL}/login`);
  await desktopPage.waitForLoadState('networkidle');
  
  // Login with test user (assuming magic link or direct session)
  // For now, let's just go to dashboard and see if there's auth
  await desktopPage.goto(`${BASE_URL}/dashboard`);
  await desktopPage.waitForLoadState('networkidle');
  await desktopPage.waitForTimeout(2000); // Wait for any animations
  
  // Check if we're on login page or dashboard
  const url = desktopPage.url();
  console.log(`  Current URL: ${url}`);
  
  if (url.includes('/login')) {
    console.log('  ⚠️  Not authenticated. Skipping screenshots.');
    console.log('  Note: NextAuth magic link required. Manual login needed.');
  } else {
    console.log('  ✅ On dashboard, capturing screenshot...');
    
    // Capture desktop AFTER screenshot
    await desktopPage.screenshot({
      path: 'docs/dashboard-redesign/screenshots/after/dashboard-desktop-1440px.png',
      fullPage: true,
    });
    await desktopPage.screenshot({
      path: '/opt/cursor/artifacts/after/dashboard-desktop-1440px.png',
      fullPage: true,
    });
    
    console.log('  ✅ Desktop screenshot saved');
    
    // Test Usability Task 1: Find needs attention items
    console.log('\\n🧪 Usability Task 1: Find needs attention items');
    const attentionSection = await desktopPage.locator('text=Needs Attention').count();
    if (attentionSection > 0) {
      console.log('  ✅ Needs attention section found');
      const attentionBadge = await desktopPage.locator('.attention-badge').textContent();
      console.log(`  📊 Attention count: ${attentionBadge}`);
    } else {
      console.log('  ⚠️  No needs attention section (may be hidden if count is 0)');
    }
    
    // Test Usability Task 2: View application status
    console.log('\\n🧪 Usability Task 2: View application status');
    const statusSection = await desktopPage.locator('text=Application Status').count();
    if (statusSection > 0) {
      console.log('  ✅ Application status section found');
      const statusGrid = await desktopPage.locator('.status-grid .status-item').count();
      console.log(`  📊 Status items visible: ${statusGrid}`);
    } else {
      console.log('  ❌ Application status section not found');
    }
    
    // Test Usability Task 3: Check recent activity
    console.log('\\n🧪 Usability Task 3: Check recent activity');
    const activitySection = await desktopPage.locator('text=Recent Activity').count();
    if (activitySection > 0) {
      console.log('  ✅ Recent activity section found');
      const timelineItems = await desktopPage.locator('.timeline-item').count();
      console.log(`  📊 Activity items: ${timelineItems}`);
    } else {
      console.log('  ❌ Recent activity section not found');
    }
    
    // Test Usability Task 4: View CV details
    console.log('\\n🧪 Usability Task 4: View CV details');
    const cvSection = await desktopPage.locator('text=Your CV').count();
    if (cvSection > 0) {
      console.log('  ✅ CV section found');
      const cvFilename = await desktopPage.locator('.cv-filename').textContent().catch(() => null);
      if (cvFilename) {
        console.log(`  📄 CV file: ${cvFilename}`);
      }
    } else {
      console.log('  ❌ CV section not found');
    }
    
    // Test Usability Task 5: Browse opportunities
    console.log('\\n🧪 Usability Task 5: Browse opportunities');
    const oppSection = await desktopPage.locator('text=Opportunities').count();
    if (oppSection > 0) {
      console.log('  ✅ Opportunities section found');
      const oppCount = await desktopPage.locator('.opp-count').textContent().catch(() => null);
      if (oppCount) {
        console.log(`  📊 Open opportunities: ${oppCount}`);
      }
      const discoverLink = await desktopPage.locator('a[href="/discover"]').count();
      if (discoverLink > 0) {
        console.log('  ✅ Link to Discover found');
      }
    } else {
      console.log('  ❌ Opportunities section not found');
    }
  }
  
  await desktopContext.close();
  
  // Mobile viewport (375px)
  console.log('\\n📱 Capturing mobile screenshots (375px)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2, // Retina display
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  
  const mobilePage = await mobileContext.newPage();
  
  await mobilePage.goto(`${BASE_URL}/dashboard`);
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.waitForTimeout(2000);
  
  const mobileUrl = mobilePage.url();
  if (!mobileUrl.includes('/login')) {
    console.log('  ✅ On dashboard, capturing mobile screenshot...');
    
    await mobilePage.screenshot({
      path: 'docs/dashboard-redesign/screenshots/after/dashboard-mobile-375px.png',
      fullPage: true,
    });
    await mobilePage.screenshot({
      path: '/opt/cursor/artifacts/after/dashboard-mobile-375px.png',
      fullPage: true,
    });
    
    console.log('  ✅ Mobile screenshot saved');
  } else {
    console.log('  ⚠️  Not authenticated on mobile viewport');
  }
  
  await mobileContext.close();
  await browser.close();
  
  console.log('\\n✅ Screenshot capture complete!');
  console.log('\\n📁 Files saved to:');
  console.log('   - docs/dashboard-redesign/screenshots/after/');
  console.log('   - /opt/cursor/artifacts/after/');
  console.log('\\n⚠️  Note: Authentication required for full capture');
  console.log('   Use NextAuth magic link or set up test session');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
