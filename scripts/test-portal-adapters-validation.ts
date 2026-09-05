/**
 * Validation script: checks that all portal adapters have HTTP confirmation
 * detection and proper error handling. Doesn't execute actual submits —
 * just validates the adapter code structure.
 */

import { PORTAL_ADAPTERS, findPortalAdapter } from "../src/lib/portal-adapters";

interface ValidationResult {
  id: string;
  label: string;
  hasHttpDetection: boolean;
  hasDryRunSupport: boolean;
  hasConfirmationField: boolean;
  hasErrorHandling: boolean;
  issues: string[];
}

async function validateAdapters(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (const adapter of PORTAL_ADAPTERS) {
    const issues: string[] = [];
    
    // Read the adapter source code to validate structure
    const adapterSource = adapter.apply.toString();
    
    // Check for HTTP detection
    const hasHttpDetection = /waitForResponse|submissionResponse/i.test(adapterSource);
    if (!hasHttpDetection) {
      issues.push("Missing HTTP response detection for HARD confirmation");
    }

    // Check for dry run support
    const hasDryRunSupport = /dryRun|DRY_RUN/i.test(adapterSource);
    if (!hasDryRunSupport) {
      issues.push("Missing dryRun mode support");
    }

    // Check for confirmation field in return
    const hasConfirmationField = /confirmation:/i.test(adapterSource);
    if (!hasConfirmationField) {
      issues.push("Missing 'confirmation' field in ApplyOutcome");
    }

    // Check for proper error handling
    const hasErrorHandling = 
      /catch\s*\([^)]*\)/g.test(adapterSource) &&
      /status:\s*["']validation_failed["']/i.test(adapterSource) &&
      /status:\s*["']unknown_error["']/i.test(adapterSource);
    if (!hasErrorHandling) {
      issues.push("Incomplete error handling (missing validation_failed or unknown_error cases)");
    }

    results.push({
      id: adapter.id,
      label: adapter.label,
      hasHttpDetection,
      hasDryRunSupport,
      hasConfirmationField,
      hasErrorHandling,
      issues,
    });
  }

  return results;
}

async function testAdapterMatching() {
  const testUrls = [
    { url: "https://boards.greenhouse.io/sumup/jobs/8427124002", expected: "greenhouse" },
    { url: "https://jobs.lever.co/company/uuid", expected: "lever" },
    { url: "https://apply.workable.com/company/j/ABC123/", expected: "workable" },
    { url: "https://jobs.ashbyhq.com/company/uuid", expected: "ashby" },
    { url: "https://jobs.smartrecruiters.com/company/job", expected: "smartrecruiters" },
    { url: "https://linkedin.com/jobs/view/123", expected: null },
    { url: "https://example.com/jobs/123", expected: null },
  ];

  console.log("\n🔍 Testing adapter URL matching:");
  for (const { url, expected } of testUrls) {
    const adapter = findPortalAdapter(url);
    const match = adapter?.id === expected ? "✓" : "✗";
    const result = adapter ? adapter.id : "none";
    console.log(`  ${match} ${url} → ${result} (expected: ${expected ?? "none"})`);
  }
}

async function main() {
  console.log("🧪 Portal Adapter Validation Script\n");
  console.log("=" . repeat(60));

  const results = await validateAdapters();
  
  console.log("\n📊 Validation Results:\n");
  
  let allPassed = true;
  for (const result of results) {
    const status = result.issues.length === 0 ? "✅ PASS" : "⚠️  ISSUES";
    allPassed = allPassed && result.issues.length === 0;
    
    console.log(`${status} ${result.label} (${result.id})`);
    console.log(`  HTTP Detection: ${result.hasHttpDetection ? "✓" : "✗"}`);
    console.log(`  Dry Run Support: ${result.hasDryRunSupport ? "✓" : "✗"}`);
    console.log(`  Confirmation Field: ${result.hasConfirmationField ? "✓" : "✗"}`);
    console.log(`  Error Handling: ${result.hasErrorHandling ? "✓" : "✗"}`);
    
    if (result.issues.length > 0) {
      console.log(`  Issues:`);
      for (const issue of result.issues) {
        console.log(`    - ${issue}`);
      }
    }
    console.log();
  }

  await testAdapterMatching();

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ All adapters passed validation!");
  } else {
    console.log("⚠️  Some adapters have issues that need attention.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Validation failed:", err);
  process.exit(1);
});
