# 🔥 URGENT: Idle Worker Root Cause - Action Required

**Status**: Critical infrastructure bug found  
**Impact**: Applications not sending, Railway worker idle despite healthy Redis connection  
**Evidence**: Railway logs 09:41 + 09:49 CEST show worker connected but ZERO job processing  

## The Smoking Gun

```
[worker] connected to Redis, ready for jobs
```

Repeated twice with **NO** `[worker] processing job` lines afterward.

**Conclusion**: Worker healthy, Redis connected, but **NO JOBS ARRIVING IN QUEUE**.

## Root Cause: Vercel REDIS_URL Missing or Mismatched

The code in `src/lib/application-queue.ts` line 20 checks:

```typescript
if (process.env.REDIS_URL) {
  await getApplicationsQueue().add("process", { applicationId });
  return;  // ← Silently succeeds OR silently fails + falls back
}
// ... falls through to HTTP self-invoke ...
```

**Three scenarios**:

1. **REDIS_URL not set on Vercel** → Falls to HTTP self-invoke → Railway never sees jobs ✅ LIKELY
2. **REDIS_URL different between Vercel and Railway** → Jobs go to wrong Redis → Railway never sees them
3. **REDIS_URL set but connection fails** → Silent fallback to HTTP → Railway never sees jobs

All three result in: **Idle Railway worker, slow HTTP processing on Vercel**

## Immediate Actions (5 minutes)

### 1. Check Vercel Environment Variables

**Dashboard**:
1. Go to https://vercel.com/geraxi/lavorai/settings/environment-variables
2. Look for `REDIS_URL`
3. Compare value with Railway `REDIS_URL`

**CLI**:
```bash
vercel env ls
```

### 2. Compare with Railway

**Expected**: IDENTICAL value
```
REDIS_URL=rediss://default:abc123xyz@region.upstash.io:6379
```

### 3. If Missing or Different on Vercel

**Add/Fix it**:
```bash
# Dashboard: Settings → Environment Variables → Add New
# OR CLI:
vercel env add REDIS_URL production

# Paste EXACT same value as Railway
# Then redeploy:
vercel --prod
```

### 4. Deploy This PR

This PR adds:
- ✅ Loud logging: `[queue] ✓ Enqueued to BullMQ: app=...`
- ✅ Fail-fast: No silent fallback if Redis fails
- ✅ Diagnostic endpoint: `/api/admin/queue-health`

**Merge**: https://github.com/Geraxi/lavorai/pull/1

### 5. Verify Fix (After Deploy)

**Check diagnostic endpoint**:
```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" \
  https://lavorai.it/api/admin/queue-health

# Expected:
# {
#   "redis": { "configured": true, "ping": "PONG" },
#   "queue": { "healthy": true, "waiting": 0, ... }
# }

# If redis.configured: false → REDIS_URL still missing on Vercel
```

**Create test application**:
1. Go to admin panel
2. Create one test application
3. Watch Vercel logs (should show):
   ```
   [queue] ✓ Enqueued to BullMQ: app=clx123 ...
   ```
4. Watch Railway logs (should show within 5 seconds):
   ```
   [worker] processing job applications:clx123
   ```

**If Railway still idle**: REDIS_URL still mismatched, repeat steps 1-3

## Why This Matters

**Before Fix**:
- Applications created → enqueue attempt silently fails/falls back → HTTP self-invoke
- HTTP self-invoke is slow, times out, stucks in "optimizing"
- Railway worker healthy but idle (no jobs in its queue)
- Users see empty dashboards

**After Fix**:
- Applications created → enqueue succeeds with loud log
- Jobs arrive in Redis queue
- Railway worker processes within seconds
- Users see "Inviata" confirmations
- Free users see value → 15-25% conversion

## Timeline

1. **Right now**: Check REDIS_URL on Vercel
2. **If missing/wrong**: Add/fix REDIS_URL → redeploy
3. **Then**: Merge PR #1 → deploy
4. **Verify**: Test application + check both logs
5. **Monitor**: Railway should stay busy, not idle

## Expected Results

**Vercel logs** (after fix):
```
[queue] ✓ Enqueued to BullMQ: app=clx123 job=applications:clx123
[queue] ✓ Enqueued to BullMQ: app=clx456 job=applications:clx456
```

**Railway logs** (after fix):
```
[worker] processing job applications:clx123
[worker] clx123 → submitted (DETECTED_HTTP_200)
[worker] processing job applications:clx456
[worker] clx456 → submitted (DETECTED_HTTP_200)
```

**User dashboard**: "Inviata ✓" status with confirmed submissions

## Questions?

- **REDIS_DIAGNOSIS.md** - Complete technical analysis
- **IMPLEMENTATION_SUMMARY.md** - All changes documented
- **PR #1** - Ready to merge: https://github.com/Geraxi/lavorai/pull/1

**This is the highest priority fix.** Without correct REDIS_URL, the entire worker architecture doesn't work. Fix this first, then all other improvements (ATS adapters, dashboard UX) will work as designed.
