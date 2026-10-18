# PR #60 Verification Results

Date: 2026-10-18  
Branch: `cursor/clean-dead-job-seeds-59b5`  
PR: https://github.com/Geraxi/lavorai/pull/60

## Test Execution Summary

### 1. ATS Endpoint Verification

**Script:** `scripts/verify-ats-endpoints.ts`  
**Purpose:** Re-verify all dead and new seeds with live API calls

#### Dead Seeds Confirmed (2026-10-18)

**Greenhouse (HTTP 404):**
```
✗ satispay
✗ bendingspoons
✗ scalapay
✗ casavo
✗ moneyfarm (moved to Workable)
✗ docebo
✗ everli
✗ treatwell (moved to Workable)
✗ nexi
✗ prima
```

**Lever (HTTP 404):**
```
✗ mollie
✗ pleo
✗ spendesk
✗ glovo
✗ factorial
```

**Recruitee (HTTP 404):**
```
✗ growens
✗ subito
```

**SmartRecruiters (0 postings):**
```
✗ Generali (0 jobs)
✗ Eni (0 jobs)
✗ UniCredit (0 jobs)
✗ IKEA (0 jobs)
✓ BoschGroup (100 jobs, 0 Italian) - KEPT
```

#### New Seeds Verified

**Workable:**
```
✓ moneyfarm: 20 total jobs, 11 Italian ✓
✓ treatwell: 98 total jobs, 12 Italian ✓
```

**Greenhouse:**
```
✓ sumup: 337 total jobs, 48 Italian ✓
```

### 2. Greenhouse URL Canonicalization Tests

**Script:** `tests/greenhouse-url-canonicalization.test.ts`  
**Status:** ✅ PASSED

```
Testing extractGreenhouseJobId...
✓ Standard Greenhouse URL
✓ Custom career page with gh_jid
✓ Custom URL with multiple params
✓ job-boards subdomain
✓ Non-Greenhouse URL (null)
✓ Invalid gh_jid parameter (null)

Testing buildCanonicalGreenhouseUrl...
✓ URL with slug
✓ URL without slug (fallback)
✓ URL with empty slug

Testing round-trip extraction and canonicalization...
✓ Round-trip canonicalization
```

**Example:**
```
Input:  https://sumup.com/careers/positions/8644734002?gh_jid=8644734002
Parsed: { id: "8644734002" }
Output: https://boards.greenhouse.io/sumup/jobs/8644734002
```

### 3. Seed Change Verification

**Script:** `scripts/verify-seed-changes.ts`  
**Status:** ✅ PASSED

```
--- New Workable Seeds (Italian jobs) ---
  ✓ moneyfarm: 11 Italian jobs (expected ≥10)
  ✓ treatwell: 12 Italian jobs (expected ≥10)

--- New Greenhouse Seeds (Italian jobs) ---
  ✓ sumup: 48 Italian jobs (expected ≥40)

--- Testing Feature Flags ---
  EURES_ENABLED: false (should be false by default) ✓
  WWR_ENABLED: false (should be false by default) ✓
```

### 4. Code Quality

**TypeScript Compilation:**
- No compilation errors in modified files
- All type exports valid
- Portal adapter extensions type-safe

**Test Coverage:**
- Greenhouse URL canonicalization: 10 test cases
- Workable Italy filter: Mock-based validation
- ATS endpoints: Live API verification

## SumUp Greenhouse Example Job

Real API response showing gh_jid URL structure:

```json
{
  "id": 8644734002,
  "title": "Agente di commercio / Procacciatore (P. IVA) – Settore pagamenti",
  "absolute_url": "https://sumup.com/careers/positions/8644734002?gh_jid=8644734002",
  "location": { "name": "Bergamo, BG, Italy" },
  "company_name": "SumUp"
}
```

**Canonical URL (after normalization):**
```
https://boards.greenhouse.io/sumup/jobs/8644734002
```

## Impact Assessment

### Jobs Eligible for Auto-Apply

**Added:**
- ~48 Italian jobs from SumUp (Greenhouse)
- ~11 Italian jobs from Moneyfarm (Workable)
- ~12 Italian jobs from Treatwell (Workable)
- **Total: ~71 new Italian job opportunities**

**Removed:**
- ~0 Italian jobs (all dead seeds had 0 active postings)

**Net Change: +71 Italian jobs eligible for auto-apply**

### ToS Compliance

**EURES:**
- Status: Disabled by default
- Already-ingested jobs: NOT auto-applied (source filter in cron)
- Future ingestion: Requires `EURES_ENABLED=true`

**We Work Remotely:**
- Status: Disabled by default
- Already-ingested jobs: NOT auto-applied (source filter in cron)
- Board resolution: Removed from eligible sources
- Future ingestion: Requires `WWR_ENABLED=true`

## Production Deployment Checklist

- [x] All tests pass locally
- [x] Dead seeds verified with live API calls
- [x] New seeds return Italian jobs
- [x] Greenhouse gh_jid canonicalization tested
- [x] Feature flags default to OFF
- [x] Auto-apply cron excludes EURES/WWR
- [ ] Monitor first sync logs after deployment for:
  ```
  [eures] DISABLED (EURES_ENABLED=false): skipping ingestion due to ToS restrictions
  [weworkremotely] DISABLED (WWR_ENABLED=false): skipping ingestion due to ToS restrictions
  ```
- [ ] Verify SumUp jobs appear in pool with canonical URLs
- [ ] Confirm no EURES/WWR jobs enter auto-apply queue

## Rollback Plan

If issues arise:

1. **Revert PR:** `git revert f4a2b9e b14722c`
2. **Re-enable old seeds:** Restore commented lines in `ats-companies.ts`
3. **Re-enable EURES/WWR:** Set env flags to `true` (if needed)

## Questions for Owner

1. **Adzuna licence:** Separate from this PR - needs owner review
2. **EURES partnership:** Can LavorAI become an official EURES partner?
3. **WWR terms:** Can we negotiate direct-apply permission with WWR?
4. **URL normalization:** Should we normalize gh_jid URLs at ingestion time instead of apply time?
