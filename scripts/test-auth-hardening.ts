import assert from "node:assert/strict";

function canonicalEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

function parseNeonEndpoint(connStr: string): { host: string; database: string } | null {
  try {
    const url = new URL(connStr);
    if (!url.hostname || !url.pathname) return null;
    const host = url.hostname.replace(/-pooler\./, ".");
    const database = url.pathname.slice(1).split("/")[0];
    return { host, database };
  } catch {
    return null;
  }
}

async function main() {
  console.log("[test-auth-hardening] Running tests...");

  // Email normalization tests
  assert.equal(
    canonicalEmail("Test.User+tag@Gmail.com"),
    "testuser@gmail.com",
    "Gmail dots and plus tags should be stripped"
  );
  
  assert.equal(
    canonicalEmail("  Mario.Rossi@EXAMPLE.COM  "),
    "mario.rossi@example.com",
    "Trim and lowercase for non-Gmail domains"
  );
  
  assert.equal(
    canonicalEmail("user@GoogleMail.com"),
    "user@gmail.com",
    "GoogleMail should normalize to gmail.com"
  );
  
  assert.equal(
    canonicalEmail("a.b.c+test@gmail.com"),
    "abc@gmail.com",
    "Multiple Gmail dots should all be removed"
  );

  // Neon endpoint comparison tests
  const direct = parseNeonEndpoint(
    "postgresql://user:pass@ep-example-123456.eu-central-1.aws.neon.tech/dbname?sslmode=require"
  );
  const pooled = parseNeonEndpoint(
    "postgresql://user:pass@ep-example-123456-pooler.eu-central-1.aws.neon.tech/dbname?sslmode=require"
  );
  
  assert.deepEqual(direct, {
    host: "ep-example-123456.eu-central-1.aws.neon.tech",
    database: "dbname",
  });
  
  assert.deepEqual(pooled, {
    host: "ep-example-123456.eu-central-1.aws.neon.tech",
    database: "dbname",
  });
  
  assert.equal(
    direct?.host,
    pooled?.host,
    "Direct and pooler hosts should match after normalization"
  );
  
  assert.equal(
    direct?.database,
    pooled?.database,
    "Direct and pooler database names should match"
  );

  // Different endpoint test
  const differentDirect = parseNeonEndpoint(
    "postgresql://user:pass@ep-different-999999.eu-central-1.aws.neon.tech/otherdb?sslmode=require"
  );
  
  assert.notEqual(
    direct?.host,
    differentDirect?.host,
    "Different endpoints should be detected"
  );
  
  assert.notEqual(
    direct?.database,
    differentDirect?.database,
    "Different databases should be detected"
  );

  // Invalid URL test
  assert.equal(
    parseNeonEndpoint("not-a-valid-url"),
    null,
    "Invalid URLs should return null"
  );

  console.log("[test-auth-hardening] ✓ All tests passed");
}

main().catch((err) => {
  console.error("[test-auth-hardening] Test failed:", err);
  process.exit(1);
});
