/**
 * Test runner for dashboard metrics
 * Run: npx tsx __tests__/dashboard-metrics.test.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  getConfirmedSubmissions,
  getRecruiterReplies,
  getInterviewInvites,
  getOffers,
  getOpenOpportunities,
  getActionsNeeded,
  getUnreadMessages,
  getAllDashboardMetrics,
} from "../src/lib/dashboard-metrics-shared";

const prisma = new PrismaClient();

async function runTests() {
  console.log("🧪 Running Dashboard Metrics Tests\n");

  // Use existing test user from seed
  const testUser = await prisma.user.findUnique({
    where: { email: "test-dashboard@lavorai.test" },
  });

  if (!testUser) {
    console.error("❌ Test user not found. Run seed first: npx tsx prisma/seed-dashboard-test.ts");
    process.exit(1);
  }

  const userId = testUser.id;
  let passed = 0;
  let failed = 0;

  // Test 1: getConfirmedSubmissions
  console.log("Test 1: getConfirmedSubmissions");
  const confirmed = await getConfirmedSubmissions(userId);
  if (confirmed === 3) {
    console.log(`  ✅ PASS: Expected 3, got ${confirmed}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 3, got ${confirmed}`);
    failed++;
  }

  // Test 2: getRecruiterReplies
  console.log("\nTest 2: getRecruiterReplies");
  const replies = await getRecruiterReplies(userId);
  if (replies === 3) {
    console.log(`  ✅ PASS: Expected 3, got ${replies}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 3, got ${replies}`);
    failed++;
  }

  // Test 3: getInterviewInvites
  console.log("\nTest 3: getInterviewInvites");
  const interviews = await getInterviewInvites(userId);
  if (interviews === 1) {
    console.log(`  ✅ PASS: Expected 1, got ${interviews}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 1, got ${interviews}`);
    failed++;
  }

  // Test 4: getOffers
  console.log("\nTest 4: getOffers");
  const offers = await getOffers(userId);
  if (offers === 0) {
    console.log(`  ✅ PASS: Expected 0, got ${offers}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 0, got ${offers}`);
    failed++;
  }

  // Test 5: getOpenOpportunities
  console.log("\nTest 5: getOpenOpportunities");
  const opportunities = await getOpenOpportunities(userId);
  if (opportunities === 6) {
    console.log(`  ✅ PASS: Expected 6, got ${opportunities}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 6, got ${opportunities}`);
    failed++;
  }

  // Test 6: getActionsNeeded
  console.log("\nTest 6: getActionsNeeded");
  const actionsNeeded = await getActionsNeeded(userId);
  if (actionsNeeded === 1) {
    console.log(`  ✅ PASS: Expected 1, got ${actionsNeeded}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 1, got ${actionsNeeded}`);
    failed++;
  }

  // Test 7: getUnreadMessages
  console.log("\nTest 7: getUnreadMessages");
  const unread = await getUnreadMessages(userId);
  if (unread === 1) {
    console.log(`  ✅ PASS: Expected 1, got ${unread}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Expected 1, got ${unread}`);
    failed++;
  }

  // Test 8: getAllDashboardMetrics
  console.log("\nTest 8: getAllDashboardMetrics (batch fetch)");
  const metrics = await getAllDashboardMetrics(userId);
  const allCorrect =
    metrics.confirmed === 3 &&
    metrics.replies === 3 &&
    metrics.interviews === 1 &&
    metrics.offers === 0 &&
    metrics.opportunities === 6 &&
    metrics.actionsNeeded === 1 &&
    metrics.unreadMessages === 1;

  if (allCorrect) {
    console.log(`  ✅ PASS: All metrics correct in batch fetch`);
    console.log(`     confirmed: ${metrics.confirmed}, replies: ${metrics.replies}, interviews: ${metrics.interviews}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Some metrics incorrect in batch fetch`);
    console.log(`     Got:`, metrics);
    failed++;
  }

  // Test 9: User isolation (other user should have no data)
  console.log("\nTest 9: User isolation (non-existent user)");
  const otherMetrics = await getAllDashboardMetrics("non-existent-user-id");
  const allZero =
    otherMetrics.confirmed === 0 &&
    otherMetrics.replies === 0 &&
    otherMetrics.interviews === 0 &&
    otherMetrics.offers === 0 &&
    otherMetrics.actionsNeeded === 0 &&
    otherMetrics.unreadMessages === 0;

  if (allZero) {
    console.log(`  ✅ PASS: Non-existent user returns all zeros (user isolation works)`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Non-existent user returned non-zero metrics (security issue!)`);
    console.log(`     Got:`, otherMetrics);
    failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("✅ All tests passed!\n");
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("\n❌ Test suite error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
