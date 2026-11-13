#!/usr/bin/env tsx
/**
 * One-shot migration: lower matchMin default from 75 → 60 for existing users.
 * 
 * Context: The auto-apply cron enqueues 0 applications because every job is 
 * blocked with reason `preference_match_threshold`. Users who never customized 
 * matchMin have NULL in DB, which falls back to 75 (the old GET default).
 * 
 * This migration:
 * 1. Sets matchMin=60 for users where matchMin IS NULL (never customized)
 * 2. Leaves users who explicitly set matchMin untouched
 * 
 * Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   tsx scripts/migrate-match-min-default.ts [--dry-run]
 */

import { prisma } from "../src/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`[migrate-match-min-default] Starting${dryRun ? " (DRY RUN)" : ""}...`);

  // Find users with NULL matchMin (never customized)
  const candidates = await prisma.userPreferences.findMany({
    where: { matchMin: null },
    select: { userId: true },
  });

  console.log(`Found ${candidates.length} users with matchMin=NULL`);

  if (candidates.length === 0) {
    console.log("No users to update");
    return;
  }

  if (dryRun) {
    console.log("DRY RUN: Would update these user IDs:");
    for (const c of candidates.slice(0, 10)) {
      console.log(`  - ${c.userId}`);
    }
    if (candidates.length > 10) {
      console.log(`  ... and ${candidates.length - 10} more`);
    }
    return;
  }

  // Update in batches to avoid long transactions
  const BATCH_SIZE = 100;
  let updated = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const userIds = batch.map((c) => c.userId);

    const result = await prisma.userPreferences.updateMany({
      where: {
        userId: { in: userIds },
        matchMin: null, // Double-check to avoid race conditions
      },
      data: { matchMin: 60 },
    });

    updated += result.count;
    console.log(`Updated ${updated}/${candidates.length} users...`);
  }

  console.log(`✓ Migration complete: updated ${updated} users to matchMin=60`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
