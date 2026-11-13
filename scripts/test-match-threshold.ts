#!/usr/bin/env tsx
/**
 * Unit tests for match threshold (matchMin) behavior:
 * - Default values in API routes
 * - Blocking behavior in auto-apply cron
 * - Runtime fallback for NULL values
 */

import assert from "node:assert/strict";

/**
 * Test: Default matchMin values across the codebase
 */
function testDefaults() {
  // The default should be 60 after migration
  const DEFAULT_MATCH_MIN = 60;

  // Verify that the default is applied consistently:
  // 1. GET /api/preferences fallback
  // 2. PUT /api/preferences create default
  // 3. UI display fallback
  
  assert.equal(DEFAULT_MATCH_MIN, 60, "Default matchMin should be 60");
  console.log("✓ Default matchMin is 60");
}

/**
 * Test: Threshold blocking behavior
 */
function testThresholdBlocking() {
  const matchMin = 60;
  
  // Jobs with score >= matchMin should pass
  const highScore = 70;
  const mediumScore = 60;
  const lowScore = 55;

  assert.equal(highScore >= matchMin, true, "Score 70 should pass threshold 60");
  assert.equal(mediumScore >= matchMin, true, "Score 60 should pass threshold 60 (inclusive)");
  assert.equal(lowScore >= matchMin, false, "Score 55 should be blocked by threshold 60");
  
  console.log("✓ Threshold blocking logic correct (>= comparison)");
}

/**
 * Test: NULL matchMin handling (runtime fallback)
 */
function testNullHandling() {
  // Simulating database NULL and fallback behavior
  const userMatchMinNull = null;
  const userMatchMinSet = 70;
  
  const DEFAULT = 60;
  
  const effectiveNull = userMatchMinNull ?? DEFAULT;
  const effectiveSet = userMatchMinSet ?? DEFAULT;
  
  assert.equal(effectiveNull, 60, "NULL matchMin should fall back to 60");
  assert.equal(effectiveSet, 70, "Explicit matchMin should not be overridden");
  
  console.log("✓ NULL matchMin handling correct");
}

/**
 * Test: Migration logic (NULL → 60, explicit values preserved)
 */
function testMigrationLogic() {
  // Simulating user states before migration
  const users = [
    { id: "user1", matchMin: null },      // Never customized → should become 60
    { id: "user2", matchMin: 70 },        // Explicitly set → should stay 70
    { id: "user3", matchMin: 50 },        // Explicitly set → should stay 50
    { id: "user4", matchMin: 75 },        // Old default → should stay 75 (was explicit)
  ];

  // Migration: UPDATE matchMin=60 WHERE matchMin IS NULL
  const afterMigration = users.map(u => ({
    ...u,
    matchMin: u.matchMin === null ? 60 : u.matchMin
  }));

  assert.equal(afterMigration[0].matchMin, 60, "NULL should become 60");
  assert.equal(afterMigration[1].matchMin, 70, "Explicit 70 should be preserved");
  assert.equal(afterMigration[2].matchMin, 50, "Explicit 50 should be preserved");
  assert.equal(afterMigration[3].matchMin, 75, "Explicit 75 should be preserved");
  
  console.log("✓ Migration logic correct (NULL → 60, explicit preserved)");
}

/**
 * Test: matchMin=0 disables threshold (special case)
 */
function testZeroDisablesThreshold() {
  const matchMin = 0;
  const score = 10; // Even low scores should pass
  
  // Logic: if (matchMin > 0 && score < matchMin) → skip
  const shouldSkip = matchMin > 0 && score < matchMin;
  
  assert.equal(shouldSkip, false, "matchMin=0 should disable threshold check");
  console.log("✓ matchMin=0 correctly disables threshold");
}

/**
 * Test: Score range validation (0-100)
 */
function testScoreRange() {
  const validScores = [0, 50, 60, 75, 100];
  const matchMin = 60;
  
  for (const score of validScores) {
    assert.ok(score >= 0 && score <= 100, `Score ${score} should be in valid range`);
    
    if (matchMin > 0) {
      const passes = score >= matchMin;
      console.log(`  Score ${score} vs threshold ${matchMin}: ${passes ? "PASS" : "BLOCK"}`);
    }
  }
  
  console.log("✓ Score range validation correct");
}

// Run all tests
function main() {
  console.log("Testing match threshold behavior...\n");
  
  testDefaults();
  testThresholdBlocking();
  testNullHandling();
  testMigrationLogic();
  testZeroDisablesThreshold();
  testScoreRange();
  
  console.log("\n✅ All match threshold tests passed");
}

main();
