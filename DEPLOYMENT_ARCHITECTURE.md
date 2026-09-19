# LavorAI Deployment Architecture

## Overview

LavorAI runs on a **hybrid architecture** to optimize costs and stay within Vercel Hobby plan limits:

- **Vercel (serverless)**: Next.js app, API routes, static pages
- **Railway (persistent worker)**: Browser automation (Playwright/Chromium), background job processing

---

## Why This Split?

### Problem with Serverless Browser Automation
Browser automation (Playwright/Chromium) is **incompatible** with Vercel serverless:

1. **Size**: Chromium binary is ~51 MB compressed
2. **Memory**: Headless Chrome needs 200-500 MB RAM (Vercel Hobby: 1 GB max)
3. **Cold start**: Extracting Chromium takes 3-5 seconds
4. **Storage**: Bundling Chromium in every function = massive deploy size

**Result**: 323 API routes × 51 MB = ~16.5 GB per deploy → **205 GB total storage** with archives.

### Solution: Railway Worker
- **Persistent process**: Worker stays running (no cold starts)
- **Full Node environment**: Can install full Playwright with browsers
- **BullMQ queue**: Vercel enqueues jobs, Railway processes them
- **Cost**: Railway Hobby plan ($5/mo) vs. Vercel Pro ($20/mo) upgrade

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER REQUEST                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js App                                         │   │
│  │  • Pages / API Routes                                │   │
│  │  • CV optimization (OpenAI)                          │   │
│  │  • User auth, DB queries                             │   │
│  │  • Job ingestion                                     │   │
│  │                                                       │   │
│  │  NO BROWSER: playwright/chromium in devDependencies  │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              │ Enqueue via BullMQ            │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Redis (Upstash)                                     │   │
│  │  • Job queue (applications to process)               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Worker polls queue
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    RAILWAY WORKER                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  worker.ts (persistent Node process)                 │   │
│  │  • Polls BullMQ queue (Redis)                        │   │
│  │  • Polls DB for queued applications                  │   │
│  │  • Processes jobs via application-worker.ts          │   │
│  │                                                       │   │
│  │  ✅ HAS BROWSER: Full Playwright + Chromium          │   │
│  │  • Portal adapters (Greenhouse, Lever, etc.)         │   │
│  │  • Email recruiter scraping                          │   │
│  │  • Adzuna URL resolution                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## File Organization

### Files That Import `browser.ts` ✅
These are **ONLY** called from Railway worker:

- `src/lib/application-worker.ts` - Main job processor
- `worker.ts` - Worker entry point

### Files That Should NEVER Import `browser.ts` ❌
- `src/app/api/**/*.ts` - ALL API routes
- Any server component under `src/app/**/page.tsx`

**Why?** API routes run on Vercel serverless, which excludes browser deps to keep functions small.

---

## Dependency Management

### Vercel (Production Build)
```bash
npm install --production
```
Installs only `dependencies`, skips `devDependencies`.

**Result:** No playwright, no chromium → small functions (<5 MB).

### Railway Worker (Docker Build)
```bash
npm ci
```
Installs **ALL** dependencies including `devDependencies`.

**Result:** Has playwright, chromium → browser automation works.

### Local Development
```bash
npm install
```
Installs everything → browser works locally for testing.

---

## package.json Structure

```json
{
  "dependencies": {
    "next": "...",
    "prisma": "...",
    "openai": "...",
    // NO playwright, NO @sparticuz/chromium
  },
  "devDependencies": {
    "playwright": "^1.59.1",
    "playwright-core": "^1.59.1",
    "@sparticuz/chromium": "^148.0.0",
    // Browser deps here = excluded from Vercel, included in Railway
  }
}
```

---

## next.config.mjs Key Settings

```javascript
export default {
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    // Keep these external (don't bundle)
  ],
  
  outputFileTracingExcludes: {
    "/api/**": [
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
      // Explicitly exclude from Vercel function bundles
    ],
  },
};
```

**Before this fix:**
- Used `outputFileTracingIncludes` to bundle Chromium
- Every function: 51 MB
- Total storage: 205 GB

**After this fix:**
- Uses `outputFileTracingExcludes` to exclude Chromium
- Every function: <5 MB
- Expected storage: <20 GB

---

## How to Enqueue Browser Work from API Routes

**WRONG** ❌
```typescript
// src/app/api/some-route/route.ts
import { launchBrowser } from "@/lib/browser"; // NO! This breaks Vercel

export async function POST() {
  const browser = await launchBrowser(); // Function will be 51 MB
  // ...
}
```

**CORRECT** ✅
```typescript
// src/app/api/some-route/route.ts
import { addApplicationToQueue } from "@/lib/bullmq-queue";

export async function POST() {
  // Create application in DB
  const app = await prisma.application.create({ ... });
  
  // Enqueue for Railway worker to process
  await addApplicationToQueue(app.id);
  
  return NextResponse.json({ status: "queued" });
}
```

The Railway worker will:
1. Poll the queue
2. Find the job
3. Process it via `application-worker.ts`
4. Use browser if needed

---

## Environment Variables

### Vercel
```bash
DATABASE_URL=...
OPENAI_API_KEY=...
REDIS_URL=...        # For BullMQ job queue
RESEND_API_KEY=...
# NO Playwright/browser env vars
```

### Railway
```bash
DATABASE_URL=...     # Same DB
REDIS_URL=...        # Same Redis
OPENAI_API_KEY=...   # Same OpenAI
RESEND_API_KEY=...   # Same Resend
WORKER_CONCURRENCY=2
AUTO_APPLY_ENABLED=true
PORTAL_SUBMIT_ENABLED=true
# Browser automation enabled here
```

---

## Deployment Checklist

### After Merging Storage Fix PR

1. **Verify Vercel function size**
   ```bash
   vercel inspect <deployment-url>
   # Check: functions should be <5 MB, not 51 MB
   ```

2. **Clean up old Vercel deployments**
   - Go to Vercel Dashboard → Deployments
   - Keep current + 1-2 rollbacks
   - Delete all others (especially pre-fix ones)
   - Target: <20 GB total storage

3. **Verify Railway worker still works**
   - Check Railway logs for `[worker] processing applicationId=...`
   - Create test application
   - Verify it completes successfully

4. **Monitor for errors**
   - Check Vercel logs: no "playwright not found" errors
   - Check Railway logs: no "chromium not found" errors

---

## Troubleshooting

### "Cannot find module 'playwright'" on Vercel
**Cause:** Something is trying to import browser.ts from an API route.

**Fix:**
1. Find the import with: `grep -r "from.*browser" src/app/api/`
2. Remove the import
3. If browser work is needed, enqueue via BullMQ instead

### "Cannot find module 'playwright'" on Railway
**Cause:** Railway Dockerfile is using `npm ci --omit=dev`.

**Fix:** Change to `npm ci` (no --omit-dev flag) in `Dockerfile.worker`.

### Auto-apply not working
**Cause:** Railway worker may be down or queue is stuck.

**Check:**
1. Railway logs: worker should show `[worker] polling DB every 15s`
2. Redis: check connection with `redis-cli ping`
3. DB: check applications stuck in `queued` status

---

## Cost Breakdown

### Before Fix (Vercel Pro Required)
- Vercel Pro: $20/mo (for large deployments)
- Railway Hobby: $5/mo
- **Total**: $25/mo

### After Fix (Vercel Hobby OK)
- Vercel Hobby: $0/mo (hobby plan)
- Railway Hobby: $5/mo
- **Total**: $5/mo

**Savings**: $20/mo = $240/year 💰

---

## References

- [Vercel Output File Tracing](https://nextjs.org/docs/app/api-reference/next-config-js/output#tracing)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Playwright on Railway](https://docs.railway.app/guides/playwright)
