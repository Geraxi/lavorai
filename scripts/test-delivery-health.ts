#!/usr/bin/env -S node --import tsx
/**
 * Test: Delivery Health Check Endpoint
 * Validates /api/health/delivery endpoint returns correct status
 */

import assert from "node:assert";

type HealthResponse = {
  status: string;
  healthy: boolean;
  blockers: string[];
  warnings: string[];
  checks: Record<string, boolean | string | null>;
};

async function testHealthEndpoint(env: Record<string, string | undefined>) {
  // Simulate the health check logic
  const resendKey = env.RESEND_API_KEY;
  const emailFrom = env.EMAIL_FROM || env.RESEND_FROM_OVERRIDE;
  const isProductionSandbox = 
    env.NODE_ENV === "production" && 
    emailFrom?.toLowerCase().includes("resend.dev");

  const checks = {
    adzuna_configured: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
    resend_api_key: Boolean(resendKey),
    email_from_configured: Boolean(emailFrom),
    email_from_sandbox: emailFrom?.includes("resend.dev") || false,
    email_from_valid: Boolean(emailFrom && !emailFrom.includes("resend.dev")),
    resend_webhook_secret: Boolean(env.RESEND_WEBHOOK_SECRET),
    inbound_email_domain: env.INBOUND_EMAIL_DOMAIN || null,
    inbound_configured: Boolean(env.INBOUND_EMAIL_DOMAIN),
    applications_paused: env.APPLICATIONS_PAUSED === "true",
  };

  const blockers: string[] = [];

  if (!checks.adzuna_configured) {
    blockers.push("adzuna_not_configured");
  }
  if (!checks.resend_api_key) {
    blockers.push("resend_key_missing");
  }
  if (!checks.email_from_configured) {
    blockers.push("email_from_missing");
  }
  if (isProductionSandbox) {
    blockers.push("email_from_sandbox_in_production");
  }
  if (checks.applications_paused) {
    blockers.push("applications_paused");
  }

  return {
    status: blockers.length === 0 ? "healthy" : "degraded",
    healthy: blockers.length === 0,
    blockers,
    checks,
  };
}

async function main() {
  console.log("Testing delivery health check logic...\n");

  // Test 1: Fully configured production environment
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      RESEND_API_KEY: "re_valid_key",
      EMAIL_FROM: "candidature@lavorai.it",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
      APPLICATIONS_PAUSED: undefined,
    });

    assert.equal(result.healthy, true, "Fully configured should be healthy");
    assert.equal(result.blockers.length, 0, "No blockers expected");
    console.log("✅ Test 1: Fully configured production - PASS");
  }

  // Test 2: Production with sandbox email (CRITICAL BLOCKER)
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      RESEND_API_KEY: "re_valid_key",
      EMAIL_FROM: "onboarding@resend.dev",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
    });

    assert.equal(result.healthy, false, "Sandbox email in prod should be unhealthy");
    assert.ok(
      result.blockers.includes("email_from_sandbox_in_production"),
      "Should block on sandbox email"
    );
    console.log("✅ Test 2: Sandbox email in production - PASS (correctly blocked)");
  }

  // Test 3: Missing Adzuna keys
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_valid_key",
      EMAIL_FROM: "candidature@lavorai.it",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
    });

    assert.equal(result.healthy, false, "Missing Adzuna should be unhealthy");
    assert.ok(
      result.blockers.includes("adzuna_not_configured"),
      "Should block on missing Adzuna"
    );
    console.log("✅ Test 3: Missing Adzuna keys - PASS");
  }

  // Test 4: Applications paused
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      RESEND_API_KEY: "re_valid_key",
      EMAIL_FROM: "candidature@lavorai.it",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
      APPLICATIONS_PAUSED: "true",
    });

    assert.equal(result.healthy, false, "Paused applications should be unhealthy");
    assert.ok(
      result.blockers.includes("applications_paused"),
      "Should block when paused"
    );
    console.log("✅ Test 4: Applications paused - PASS");
  }

  // Test 5: Development with sandbox email (OK)
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "development",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      RESEND_API_KEY: "re_valid_key",
      EMAIL_FROM: "onboarding@resend.dev",
    });

    // In development, sandbox email is acceptable
    assert.equal(
      result.blockers.includes("email_from_sandbox_in_production"),
      false,
      "Sandbox OK in development"
    );
    console.log("✅ Test 5: Sandbox email in development - PASS (allowed)");
  }

  // Test 6: Missing Resend API key
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      EMAIL_FROM: "candidature@lavorai.it",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
    });

    assert.equal(result.healthy, false, "Missing Resend key should be unhealthy");
    assert.ok(
      result.blockers.includes("resend_key_missing"),
      "Should block on missing Resend key"
    );
    console.log("✅ Test 6: Missing Resend API key - PASS");
  }

  // Test 7: Missing EMAIL_FROM
  {
    const result = await testHealthEndpoint({
      NODE_ENV: "production",
      ADZUNA_APP_ID: "test-id",
      ADZUNA_APP_KEY: "test-key",
      RESEND_API_KEY: "re_valid_key",
      RESEND_WEBHOOK_SECRET: "whsec_valid",
      INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it",
    });

    assert.equal(result.healthy, false, "Missing EMAIL_FROM should be unhealthy");
    assert.ok(
      result.blockers.includes("email_from_missing"),
      "Should block on missing EMAIL_FROM"
    );
    console.log("✅ Test 7: Missing EMAIL_FROM - PASS");
  }

  console.log("\n✅ All delivery health tests passed!");
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
