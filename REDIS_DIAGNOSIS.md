# Redis Queue Diagnosis - Idle Worker Root Cause

## Evidence from Railway Logs (09:41 and 09:49 CEST)

```
[worker] connected to Redis, ready for jobs
```

**Twice**, with **ZERO** `[worker] processing job` lines afterward.

This confirms:
- ✅ Railway worker is healthy and connected to Redis
- ✅ `AUTO_APPLY_ENABLED=true` on Railway
- ❌ **No jobs arriving in the queue** (worker is idle)

## Root Cause: Vercel Not Enqueueing to Same Redis

### Code Analysis

**File**: `src/lib/application-queue.ts` line 20-32

```typescript
if (process.env.REDIS_URL) {
  try {
    await getApplicationsQueue().add("process", { applicationId }, { jobId: applicationId });
    return;  // ← SILENT SUCCESS - no logging
  } catch (err) {
    console.error("[queue] BullMQ enqueue failed, fallback in-process", err);
    // ← Falls through to HTTP self-invoke silently
  }
}
```

### Critical Issues Found

1. **Silent Success**: When `REDIS_URL` is set and enqueue succeeds, there's NO console.log
   - Can't verify in Vercel logs whether jobs are being enqueued
   - No way to diagnose "enqueue succeeds but wrong Redis"

2. **Silent Fallback**: If BullMQ enqueue fails (wrong Redis URL, network, auth), it falls through to HTTP self-invoke
   - This defeats the whole worker architecture
   - Railway worker sits idle because jobs go to Vercel HTTP instead

3. **Missing REDIS_URL on Vercel**: Most likely cause
   - Vercel env vars don't include REDIS_URL
   - OR Vercel REDIS_URL points to different Redis than Railway
   - Enqueue falls through to HTTP self-invoke (lines 72-125)
   - Railway worker never sees jobs

## How to Verify

### 1. Check Vercel Environment Variables

```bash
# In Vercel dashboard or CLI
vercel env ls

# Expected:
# REDIS_URL=rediss://...upstash.io:6379  ← MUST match Railway
```

### 2. Check Railway Environment Variables

```bash
# In Railway dashboard
# Expected:
# REDIS_URL=rediss://...upstash.io:6379  ← MUST match Vercel
```

### 3. Use New Diagnostic Endpoint

```bash
# Hit Vercel (web app)
curl -H "x-admin-key: YOUR_ADMIN_KEY" \
  https://lavorai.it/api/admin/queue-health

# Expected response:
{
  "timestamp": "2026-09-05T09:50:00Z",
  "environment": "vercel",
  "redis": {
    "configured": true,
    "url": "default.upstash.io:6379",  // ← Should match Railway
    "ping": "PONG"
  },
  "queue": {
    "name": "applications",
    "waiting": 0,
    "active": 0,
    "completed": 12,
    "failed": 0,
    "total": 12,
    "healthy": true
  }
}

# If REDIS_URL missing on Vercel:
{
  "redis": { "configured": false, "url": null },
  "error": "REDIS_URL not configured - BullMQ disabled, falling back to HTTP self-invoke"
}
```

### 4. Check Vercel Logs for Enqueue

After fix is deployed, look for:

```
[queue] ✓ Enqueued to BullMQ: app=clx123 job=applications:clx123 queue=applications
```

**Before fix**: This log line didn't exist (silent success)
**After fix**: Every enqueue is logged loudly

### 5. Trigger Test Application

```bash
# Create test application via admin panel or API
# Watch both logs:

# Vercel logs should show:
[queue] ✓ Enqueued to BullMQ: app=clx123 ...

# Railway logs should show (within seconds):
[worker] processing job applications:clx123
[worker] clx123 → submitted (DETECTED_HTTP_200)
```

## Fix Applied

### 1. Loud Success Logging

```typescript
const job = await queue.add("process", { applicationId }, { jobId: applicationId });
console.log(`[queue] ✓ Enqueued to BullMQ: app=${applicationId} job=${job.id} queue=${queue.name}`);
```

### 2. Fail Loud (No Silent Fallback)

```typescript
} catch (err) {
  console.error(`[queue] ❌ CRITICAL: BullMQ enqueue FAILED for app=${applicationId}`, err);
  console.error(`[queue] REDIS_URL is set but queue is broken. Worker will be IDLE.`);
  
  // Mark application as failed
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "failed",
      errorMessage: "Errore infrastruttura: impossibile accodare (Redis failed)",
      completedAt: new Date(),
    },
  });
  
  // Re-throw (API returns 500, no silent fallback)
  throw new Error(`BullMQ enqueue failed: ${err.message}`);
}
```

### 3. Diagnostic Endpoint

`/api/admin/queue-health` - verifies Redis connectivity and queue stats

## Action Items for Umberto

### Immediate (Before Deploying Fix)

1. **Verify REDIS_URL on Vercel**
   ```bash
   # Vercel dashboard → Settings → Environment Variables
   # OR via CLI:
   vercel env ls
   ```

2. **Compare with Railway REDIS_URL**
   - They MUST be identical
   - Format: `rediss://default:PASSWORD@HOST:6379`

3. **If Missing on Vercel**: Add it
   ```bash
   vercel env add REDIS_URL
   # Paste the same value as Railway
   ```

### After Deploying Fix

1. **Deploy this PR to Vercel**
   - Includes loud logging + fail-loud behavior

2. **Check Diagnostic Endpoint**
   ```bash
   curl -H "x-admin-key: $ADMIN_KEY" https://lavorai.it/api/admin/queue-health
   ```
   
   Expected: `"healthy": true` and queue stats

3. **Trigger Test Application**
   - Create one application via admin panel
   - Watch Vercel logs for: `[queue] ✓ Enqueued to BullMQ`
   - Watch Railway logs for: `[worker] processing job`
   - Should see activity within 5 seconds

4. **Trigger Auto-Apply Cron**
   ```bash
   curl -X GET -H "x-admin-key: $ADMIN_KEY" \
     https://lavorai.it/api/cron/auto-apply
   ```
   
   Watch both logs for enqueue → process flow

## Expected Outcome

**Before Fix**:
- Vercel: Silent (no logs whether Redis or HTTP)
- Railway: `[worker] connected to Redis, ready for jobs` then idle forever
- Applications: Stuck in "queued" or processed via HTTP self-invoke (slow, timeouts)

**After Fix**:
- Vercel: `[queue] ✓ Enqueued to BullMQ: app=...` for every application
- Railway: `[worker] processing job` within seconds
- Applications: Progress queued → optimizing → applying → success
- Users: See "Inviata" in dashboard with confirmed submissions

## Smoking Gun Confirmation

The Railway worker log `[worker] connected to Redis, ready for jobs` with ZERO job processing is **definitive proof** that:

1. Redis connection works (worker connected successfully)
2. Jobs are NOT arriving in the queue
3. Therefore: Vercel is either:
   - Not setting REDIS_URL (falls to HTTP self-invoke)
   - Setting REDIS_URL to a DIFFERENT Redis (wrong queue)
   - Enqueueing but silently failing (caught by try-catch, falls to HTTP)

The fix ensures we detect and loudly report case #3, and the diagnostic endpoint helps verify cases #1 and #2.
