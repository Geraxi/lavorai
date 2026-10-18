/**
 * Tests for Greenhouse URL canonicalization (gh_jid parameter support).
 * 
 * Ensures:
 * 1. extractGreenhouseJobId correctly parses standard and gh_jid URLs
 * 2. buildCanonicalGreenhouseUrl produces correct canonical URLs
 * 3. Custom career page URLs are recognized as eligible
 * 
 * Run with: npx tsx tests/greenhouse-url-canonicalization.test.ts
 */

import { extractGreenhouseJobId, buildCanonicalGreenhouseUrl } from "../src/lib/portal-adapters/greenhouse";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Got: ${JSON.stringify(actual)}`);
  }
}

async function testExtractGreenhouseJobId() {
  console.log("Testing extractGreenhouseJobId...");

  // Standard Greenhouse URL
  const standard = extractGreenhouseJobId("https://boards.greenhouse.io/sumup/jobs/8644734002");
  assertEqual(standard, { id: "8644734002", slug: "sumup" }, "Standard Greenhouse URL");

  // Custom career page with gh_jid
  const customWithGhJid = extractGreenhouseJobId("https://sumup.com/careers/positions/8644734002?gh_jid=8644734002");
  assertEqual(customWithGhJid, { id: "8644734002" }, "Custom career page with gh_jid");

  // Custom career page with gh_jid and other params
  const customWithMultipleParams = extractGreenhouseJobId("https://sumup.com/careers/positions/8507799002?gh_jid=8507799002&source=LinkedIn");
  assertEqual(customWithMultipleParams, { id: "8507799002" }, "Custom URL with multiple params");

  // job-boards subdomain
  const jobBoards = extractGreenhouseJobId("https://job-boards.greenhouse.io/stripe/jobs/12345");
  assertEqual(jobBoards, { id: "12345", slug: "stripe" }, "job-boards subdomain");

  // Non-Greenhouse URL
  const nonGreenhouse = extractGreenhouseJobId("https://jobs.lever.co/company/posting-id");
  assertEqual(nonGreenhouse, null, "Non-Greenhouse URL");

  // Invalid gh_jid (non-numeric)
  const invalidGhJid = extractGreenhouseJobId("https://example.com/jobs?gh_jid=abc123");
  assertEqual(invalidGhJid, null, "Invalid gh_jid parameter");

  console.log("✓ All extractGreenhouseJobId tests passed");
}

async function testBuildCanonicalGreenhouseUrl() {
  console.log("Testing buildCanonicalGreenhouseUrl...");

  // With slug
  const withSlug = buildCanonicalGreenhouseUrl("8644734002", "sumup");
  assertEqual(withSlug, "https://boards.greenhouse.io/sumup/jobs/8644734002", "URL with slug");

  // Without slug (fallback)
  const withoutSlug = buildCanonicalGreenhouseUrl("8644734002", null);
  assertEqual(withoutSlug, "https://job-boards.greenhouse.io/jobs/8644734002", "URL without slug");

  // Empty slug
  const emptySlug = buildCanonicalGreenhouseUrl("12345", "");
  assertEqual(emptySlug, "https://job-boards.greenhouse.io/jobs/12345", "URL with empty slug");

  console.log("✓ All buildCanonicalGreenhouseUrl tests passed");
}

async function testRoundTrip() {
  console.log("Testing round-trip extraction and canonicalization...");

  const customUrl = "https://sumup.com/careers/positions/8644734002?gh_jid=8644734002";
  const extracted = extractGreenhouseJobId(customUrl);
  assert(extracted !== null, "Should extract job ID");
  
  // Simulate having the slug from database
  const canonicalUrl = buildCanonicalGreenhouseUrl(extracted!.id, "sumup");
  assertEqual(canonicalUrl, "https://boards.greenhouse.io/sumup/jobs/8644734002", "Round-trip canonicalization");

  console.log("✓ Round-trip test passed");
}

async function main() {
  try {
    await testExtractGreenhouseJobId();
    await testBuildCanonicalGreenhouseUrl();
    await testRoundTrip();
    console.log("\n✅ All Greenhouse URL canonicalization tests passed!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  }
}

main();
