# Test Plan - Portal Submissions & Honest Tracking Fix

## Quick Verification (5 minutes)

### 1. Check PR #1 Status

```bash
gh pr view 1 --json state,headRefName
# If OPEN and cursor/fix-real-portal-submissions-8663:
#   → PR #6 supersedes it (includes all fixes + more)
#   → Close PR #1 after merging PR #6
```

### 2. Database Schema Update

```bash
# After merge, in production:
npx prisma db push

# Verify new fields exist:
psql $DATABASE_URL -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'Application' 
    AND column_name IN ('submittedAt', 'lastStatusCheckAt')
"
```

Expected output:
```
   column_name      |       data_type       
--------------------+-----------------------
 submittedAt        | timestamp without time zone
 lastStatusCheckAt  | timestamp without time zone
```

## Critical Infrastructure Fixes

### Test 1: Vercel Blob Suspension Detection

**Purpose**: Verify storage failures are caught and alerted properly

```bash
# In Vercel dashboard, temporarily remove BLOB_READ_WRITE_TOKEN
# OR in local dev:
unset BLOB_READ_WRITE_TOKEN

# Trigger application creation
curl -X POST http://localhost:3000/api/admin/test-apply \
  -H "x-admin-key: $ADMIN_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "jobUrl": "https://boards.greenhouse.io/stripe/jobs/123456"
  }'
```

**Expected Results**:
1. Application worker catches error during CV generation
2. Error message includes: `BLOB_SUSPENDED: Il Vercel Blob store è sospeso`
3. Application marked as `failed` with clear user message
4. Founder receives email alert with action items:
   - Check Vercel dashboard → Blob → Unsuspend
   - OR configure Supabase Storage env vars
5. Check logs for:
   ```
   [worker] app123 AI/generate failed
   [worker] STORAGE SOSPESO: Vercel Blob non disponibile
   [founder-alert] blob_suspended sent to <founder-email>
   ```

**Fix Actions**:
- **Option A**: Vercel dashboard → Blob → Click "Unsuspend"
- **Option B**: Add Supabase Storage:
  ```bash
  vercel env add SUPABASE_URL production
  # Enter: https://your-project.supabase.co
  
  vercel env add SUPABASE_SERVICE_ROLE_KEY production
  # Enter: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  
  vercel env add SUPABASE_STORAGE_BUCKET production
  # Enter: lavorai
  ```

### Test 2: AI Credits Exhaustion

**Purpose**: Verify AI quota failures are detected and alerted

```bash
# Option A: Set invalid API key
vercel env add OPENAI_API_KEY production
# Enter: sk-invalid-key-for-testing

# Option B: Exhaust real quota (not recommended)
# Just wait for natural exhaustion and verify alert arrives

# Trigger application
curl -X POST http://localhost:3000/api/admin/test-apply \
  -H "x-admin-key: $ADMIN_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "jobUrl": "https://boards.greenhouse.io/company/jobs/123"
  }'
```

**Expected Results**:
1. Worker catches `isCreditExhaustedError`
2. Application marked `failed` with message:
   ```
   CREDITI AI ESAURITI: servizio temporaneamente non disponibile.
   Ricarica crediti OpenAI/Anthropic. Candidatura in coda per retry automatico.
   ```
3. Founder email alert with:
   - Link to OpenAI billing: https://platform.openai.com/settings/organization/billing
   - Link to Anthropic console: https://console.anthropic.com/settings/billing
4. Application NOT marked `completedAt` (stays in queue for retry)
5. Check logs:
   ```
   [worker] app456 AI/generate failed
   [worker] CREDITI AI ESAURITI detected
   [founder-alert] ai_credits sent
   ```

**Fix Actions**:
1. Go to [OpenAI Billing](https://platform.openai.com/settings/organization/billing)
2. Add payment method OR increase spending limit
3. Go to [Anthropic Console](https://console.anthropic.com/settings/billing) (fallback)
4. Verify credits restored
5. Failed applications will auto-retry on next worker poll

## Portal Submission Hard Proof

### Test 3: Greenhouse Confirmed Submit

**Purpose**: Verify HTTP capture provides hard proof of submission

```bash
# Use real Greenhouse job (or staging endpoint)
npm run worker

# Watch logs for application processing
tail -f /var/log/railway/worker.log
```

**Expected Log Sequence**:
```
[worker] app789 processing job
[greenhouse] captcha check: none → ok (invisible badge non-blocking)
[greenhouse] ai-answer: answered=5 remaining=0
[greenhouse] HTTP POST captured: https://boards.greenhouse.io/.../applications
[greenhouse] HTTP response: 200
[worker] app789 adapter greenhouse → submitted (DETECTED_HTTP_200)
[worker] app789 marked success with submittedAt=2026-09-19T18:30:00Z
```

**Database Verification**:
```sql
SELECT 
  id,
  status,
  submitConfirmation,
  submittedAt,
  submittedVia,
  errorMessage
FROM "Application" 
WHERE id = 'app789';
```

**Expected Results**:
```
id      | app789
status  | success
submitConfirmation | DETECTED_HTTP_200
submittedAt | 2026-09-19 18:30:00
submittedVia | portal_greenhouse
errorMessage | null
```

### Test 4: Unconfirmed Submit (No Proof)

**Purpose**: Verify applications without hard proof are NOT marked success

Simulate by:
1. Form validation error (client-side blocked submit)
2. Unusual endpoint we don't capture
3. Server 4xx rejection

```bash
# This will happen naturally for some edge cases
# Check logs for:
[worker] app012 adapter greenhouse → validation_failed
[worker] app012 marked ready_to_apply (UNCONFIRMED)
```

**Database Verification**:
```sql
SELECT 
  id,
  status,
  submitConfirmation,
  submittedAt,
  errorMessage
FROM "Application" 
WHERE id = 'app012';
```

**Expected Results**:
```
id      | app012
status  | ready_to_apply
submitConfirmation | UNCONFIRMED (or null)
submittedAt | null
errorMessage | Submit cliccato ma conferma non rilevata. Verifica manualmente...
```

## Honest Recruiter Response Tracking

### Test 5: Ghosting Status Computation

**Purpose**: Verify ghosting logic works correctly

```typescript
// Run in Node console or create test script
import { computeGhostingStatus } from './src/lib/ghosting-tracker';

// Test case 1: Just sent (today)
const justSent = {
  status: 'success',
  submittedAt: new Date(),
  lastReplyAt: null,
  replyCount: 0,
  submitConfirmation: 'DETECTED_HTTP_200',
};
console.log('Just sent:', computeGhostingStatus(justSent));
// Expected: { status: 'sent', daysSinceSubmit: 0, label: 'Inviata oggi', badgeColor: 'yellow' }

// Test case 2: Sent 3 days ago (waiting normally)
const waiting = {
  status: 'success',
  submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  lastReplyAt: null,
  replyCount: 0,
  submitConfirmation: 'DETECTED_HTTP_200',
};
console.log('Waiting 3d:', computeGhostingStatus(waiting));
// Expected: { status: 'sent', daysSinceSubmit: 3, label: 'Inviata 3g fa', badgeColor: 'yellow' }

// Test case 3: Ghosted (>7 days, no reply)
const ghosted = {
  status: 'success',
  submittedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  lastReplyAt: null,
  replyCount: 0,
  submitConfirmation: 'DETECTED_HTTP_200',
};
console.log('Ghosted 8d:', computeGhostingStatus(ghosted));
// Expected: { status: 'ghosted', daysSinceSubmit: 8, label: 'Nessuna risposta (8g)', badgeColor: 'gray' }

// Test case 4: Replied
const replied = {
  status: 'success',
  submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  lastReplyAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  replyCount: 1,
  submitConfirmation: 'DETECTED_HTTP_200',
};
console.log('Replied:', computeGhostingStatus(replied));
// Expected: { status: 'replied', daysSinceSubmit: 10, label: 'Risposta ricevuta', badgeColor: 'green' }

// Test case 5: Not submitted (no tracking)
const notSubmitted = {
  status: 'ready_to_apply',
  submittedAt: null,
  lastReplyAt: null,
  replyCount: 0,
  submitConfirmation: null,
};
console.log('Not submitted:', computeGhostingStatus(notSubmitted));
// Expected: null
```

### Test 6: Follow-Up Draft Generation

**Purpose**: Verify draft follow-up emails are generated correctly

```bash
# Create a ghosted application (8+ days old)
# Then fetch follow-up draft:

curl http://localhost:3000/api/applications/app-ghosted-123/followup \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "subject": "Sollecito candidatura — Senior Product Designer",
  "body": "Gentile team di Acme Corp,\n\nVi avevo inviato la mia candidatura per la posizione di Senior Product Designer circa 8 giorni fa.\n\nSono ancora molto interessato/a a questa opportunità e vorrei sapere se avete avuto modo di esaminare il mio profilo. Sono disponibile per un colloquio conoscitivo nei prossimi giorni.\n\nResto in attesa di un vostro riscontro.\n\nCordiali saluti,\nMario",
  "toAddress": "recruiting@acme.com",
  "jobTitle": "Senior Product Designer",
  "company": "Acme Corp",
  "mailtoLink": "mailto:recruiting@acme.com?subject=Sollecito%20candidatura%20%E2%80%94%20Senior%20Product%20Designer&body=..."
}
```

**UI Test**:
1. User clicks "Invia follow-up" button
2. Modal opens with pre-filled email
3. User can edit body
4. Click "Apri in email client" → opens mailto: link
5. User's email client opens with draft
6. **USER decides whether to send** (we NEVER auto-send)

## Production Monitoring

### Metrics to Track (First 7 Days)

1. **submitConfirmation Distribution**
   ```sql
   SELECT 
     submitConfirmation,
     COUNT(*) as count,
     ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
   FROM "Application" 
   WHERE status = 'success' 
     AND createdAt > NOW() - INTERVAL '7 days'
   GROUP BY submitConfirmation
   ORDER BY count DESC;
   ```
   
   **Target**: >90% `DETECTED_HTTP_*` (hard proof)

2. **Storage Failures**
   ```sql
   SELECT COUNT(*) as blob_suspended_failures
   FROM "Application" 
   WHERE errorMessage LIKE '%BLOB_SUSPENDED%'
     AND createdAt > NOW() - INTERVAL '7 days';
   ```
   
   **Target**: 0 (after Blob unsuspended OR Supabase configured)

3. **AI Credit Failures**
   ```sql
   SELECT COUNT(*) as ai_credit_failures
   FROM "Application" 
   WHERE errorMessage LIKE '%CREDITI AI ESAURITI%'
     AND createdAt > NOW() - INTERVAL '7 days';
   ```
   
   **Target**: 0 (after credits restored)

4. **Success Rate Improvement**
   ```sql
   -- Before fix (baseline from last 14 days)
   SELECT 
     status,
     COUNT(*) as count,
     ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
   FROM "Application" 
   WHERE createdAt BETWEEN NOW() - INTERVAL '21 days' AND NOW() - INTERVAL '7 days'
   GROUP BY status;
   
   -- After fix (first 7 days post-merge)
   SELECT 
     status,
     COUNT(*) as count,
     ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
   FROM "Application" 
   WHERE createdAt > NOW() - INTERVAL '7 days'
   GROUP BY status;
   ```
   
   **Target**: 
   - `success` rate: 5.5% → >15%
   - `failed` rate: 40% → <10%

5. **Ghosting Distribution**
   ```sql
   SELECT 
     CASE 
       WHEN "lastReplyAt" IS NOT NULL THEN 'replied'
       WHEN "submittedAt" IS NOT NULL 
         AND "submittedAt" < NOW() - INTERVAL '7 days' 
         AND "replyCount" = 0 
       THEN 'ghosted'
       WHEN "submittedAt" IS NOT NULL 
       THEN 'sent'
       ELSE 'no_timestamp'
     END AS ghosting_status,
     COUNT(*)
   FROM "Application"
   WHERE status = 'success'
     AND createdAt > NOW() - INTERVAL '7 days'
   GROUP BY ghosting_status;
   ```

## Rollback Plan (If Needed)

If critical issues found post-deploy:

```bash
# 1. Revert PR merge
git revert <commit-hash>
git push origin main

# 2. OR deploy previous version
vercel rollback

# 3. Check what broke
vercel logs --since 1h

# 4. Schema is additive (new nullable fields), no rollback needed
# But if data inconsistency:
UPDATE "Application" 
SET "submittedAt" = NULL 
WHERE "submittedAt" IS NOT NULL 
  AND "submitConfirmation" NOT LIKE 'DETECTED%';
```

## Success Criteria

**Fix is successful if**:

1. ✅ **Blob failures = 0** (after unsuspend OR Supabase config)
2. ✅ **AI credit failures = 0** (after credits restored)
3. ✅ **>90% success have DETECTED_HTTP confirmation** (hard proof)
4. ✅ **Unconfirmed submits are NOT marked success** (no false positives)
5. ✅ **Ghosting tracking shows realistic distribution** (many ATS don't reply)
6. ✅ **Follow-up drafts work** (user can generate and send manually)
7. ✅ **Success rate increases** (5.5% → >15%)
8. ✅ **No fake recruiter emails sent** (NEVER auto-impersonate)

## Post-Deployment Checklist

Day 1:
- [ ] Run `npx prisma db push` in production
- [ ] Check Vercel Blob status (unsuspend OR configure Supabase)
- [ ] Check AI credits (OpenAI + Anthropic)
- [ ] Monitor founder alerts (should receive 0 new blob/AI alerts)
- [ ] Verify first 10 applications have `submittedAt` populated

Day 2-3:
- [ ] Check submitConfirmation distribution (target >90% DETECTED)
- [ ] Check ghosting computation (query above)
- [ ] Test follow-up draft API on 1 ghosted application

Day 7:
- [ ] Compare success rate before/after (query above)
- [ ] Verify 0 storage failures in last 7 days
- [ ] Verify 0 AI credit failures in last 7 days
- [ ] If metrics good → PR #1 can be closed (superseded by #6)

---

**Questions?** See `HONEST_TRACKING_FIX.md` for detailed documentation.
