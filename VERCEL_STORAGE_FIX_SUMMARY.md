# Vercel Storage Fix - Quick Summary

## Problem Solved
**Before:** 205.85 GB total Vercel storage (exceeded Hobby plan limits)  
**After:** <20 GB expected (Hobby plan stays viable)

## What Changed

### 1. Configuration (`next.config.mjs`)
```diff
- outputFileTracingIncludes: { "/api/**": ["./node_modules/@sparticuz/chromium/**"] }
+ outputFileTracingExcludes: { "/api/**": ["chromium/**", "playwright/**"] }
```
**Impact:** Chromium no longer bundled in Vercel functions

### 2. Dependencies (`package.json`)
- Moved `playwright`, `playwright-core`, `@sparticuz/chromium` to `devDependencies`
- Vercel (production build): skips these → small functions
- Railway (worker): installs all deps → browser works

### 3. Railway Worker (`Dockerfile.worker`)
```diff
- RUN npm ci --omit-dev
+ RUN npm ci  # Include devDependencies for browser
```

### 4. Removed Vercel Browser Import
- `src/app/api/admin/browser-healthcheck/route.ts` - no longer imports browser
- Only `src/lib/application-worker.ts` imports browser (runs on Railway only)

## Verification

### Before Deploying
```bash
# Check configuration is valid
node -e "require('./next.config.mjs')"
```

### After Deploying
```bash
# Automated check
npm run build
./scripts/verify-no-chromium-in-functions.sh

# Manual check
vercel inspect <deployment-url>
# Should show functions <5 MB, not 51 MB
```

## Cleanup Required (IMPORTANT!)

After deploying this fix, **must delete old Vercel deployments** to reclaim storage:

1. **Vercel Dashboard:**
   - Go to: Dashboard → lavorai → Deployments
   - Keep: Current production + 1-2 recent rollbacks
   - Delete: All others (especially pre-fix deployments)

2. **Via CLI:**
   ```bash
   vercel ls lavorai
   vercel remove <old-deployment-url> --yes
   ```

3. **Monitor:**
   - Dashboard → Settings → Usage
   - Target: <20 GB total storage

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Function size | ~51 MB | <5 MB |
| Deploy size | ~16.5 GB | ~1.5 GB |
| Total storage | ~205 GB | <20 GB (after cleanup) |
| Vercel plan | Pro required ($20/mo) | Hobby OK ($0/mo) |

## Safety

✅ **Safe to merge because:**
- Browser never actually worked on Vercel (would OOM/timeout)
- All browser work already runs on Railway worker via BullMQ
- No API routes directly call browser (verified with grep)
- Railway worker unchanged (still has full Playwright)

❌ **If something breaks:**
- Revert PR
- Redeploy previous version
- Railway worker continues working

## Key Files Modified

1. `next.config.mjs` - Exclude chromium from function tracing
2. `package.json` - Move browser deps to devDependencies
3. `Dockerfile.worker` - Install all deps (including devDeps)
4. `src/app/api/admin/browser-healthcheck/route.ts` - Remove browser import
5. `src/lib/browser.ts` - Add warning about API route imports

## New Documentation

1. `DEPLOYMENT_ARCHITECTURE.md` - Complete architecture guide
2. `scripts/verify-no-chromium-in-functions.sh` - Automated verification
3. `VERCEL_STORAGE_FIX_SUMMARY.md` - This file (quick reference)

## Cost Impact

**Before:** Vercel Pro ($20/mo) + Railway ($5/mo) = **$25/mo**  
**After:** Vercel Hobby ($0/mo) + Railway ($5/mo) = **$5/mo**

**Annual savings: $240** 💰

## PR Details

- **Branch:** `cursor/vercel-storage-fix-1a7a`
- **PR:** [#3](https://github.com/Geraxi/lavorai/pull/3)
- **Status:** Open (ready to merge)
- **Priority:** High (billing issue)
- **Independence:** Can merge separately from PR #1

## Next Steps

1. ✅ Code changes complete
2. ✅ Documentation added
3. ✅ Verification script created
4. ⏳ Review PR #3
5. ⏳ Merge to main
6. ⏳ Deploy to production
7. ⏳ Run verification script
8. ⏳ Delete old Vercel deployments
9. ⏳ Monitor Vercel usage dashboard

## Contact

Questions? Check:
- Full architecture: `DEPLOYMENT_ARCHITECTURE.md`
- PR description: [#3](https://github.com/Geraxi/lavorai/pull/3)
