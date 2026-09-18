# Verification Guide: Growth Lead Magnet & Social Proof

## PR: https://github.com/Geraxi/lavorai/pull/4

## Quick Summary

Two product changes for LavorAI growth:

1. **CV audit lead magnet** (`/optimize`) — enhanced with marketing opt-in and clear post-result CTAs
2. **Real social proof** (homepage) — replaced fake metrics with live DB counts, disabled placeholder testimonials

## Changes Overview

### Files Modified

```
prisma/schema.prisma                        # +2 fields: marketingConsent
src/app/(marketing)/optimize/page.tsx       # Enhanced result page + consent checkbox
src/app/(marketing)/page.tsx                # Live metrics with users count
src/app/api/optimize/stage/route.ts         # Save marketing consent
src/components/sections/testimonials-v2.tsx # Hide when empty
src/lib/auth.ts                            # Adopt marketing consent on signup
src/lib/marketing-content.ts                # Clear placeholder testimonials
```

### Database Schema Changes

```sql
-- Add to PendingCvSubmission
ALTER TABLE "PendingCvSubmission" ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false;

-- Add to User
ALTER TABLE "User" ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false;
```

## Verification Steps

### 1. Test `/optimize` Lead Magnet Flow

**URL:** https://lavorai.it/optimize (or preview deploy)

#### Step 1: Upload CV and submit
- [ ] Visit `/optimize`
- [ ] Upload a test CV (PDF or DOCX)
- [ ] Enter email: `test+growth@example.com`
- [ ] Check **"Ho letto la privacy policy"** ✅
- [ ] Check **"Voglio ricevere offerte simili"** ✅ (NEW — optional)
- [ ] Click **"Inizia gratis"**

#### Step 2: Verify confirmation page
- [ ] See "Controlla la tua email" heading
- [ ] Email displayed: `test+growth@example.com`
- [ ] 4-step checklist visible:
  - "Apri l'email da LavorAI"
  - "Clicca il magic link"
  - "Vedi score ATS + CV ottimizzato + cover letter"
  - "Completa le preferenze per iniziare la prova gratuita"
- [ ] **CTA button present:** "Completa il setup — 7 giorni gratis"
- [ ] **Soft Pro upgrade box visible** at bottom:
  - "💎 Passa a Pro per candidarti in automatico"
  - "Da €19.99/mese · Candidature illimitate..."
  - Link to `/pricing`

#### Step 3: Test magic link
- [ ] Check email inbox for magic link
- [ ] Click magic link → redirects to `/onboarding`
- [ ] CV already loaded (message: "CV già pronto ✨")
- [ ] Complete onboarding flow

#### Step 4: Verify database
```sql
-- Check PendingCvSubmission (before login)
SELECT email, marketingConsent FROM "PendingCvSubmission" 
WHERE email = 'test+growth@example.com';
-- Expected: marketingConsent = true

-- Check User (after login)
SELECT email, marketingConsent FROM "User" 
WHERE email = 'test+growth@example.com';
-- Expected: marketingConsent = true (adopted from staging)
```

#### Step 5: Test without marketing consent
- [ ] Repeat flow with different email
- [ ] **Do NOT check** "Voglio ricevere offerte simili"
- [ ] Verify `marketingConsent = false` in DB
- [ ] Flow should work identically (consent is optional)

### 2. Test Homepage Real Metrics

**URL:** https://lavorai.it/

#### Step 1: Stats section
- [ ] Scroll to **"Numeri reali della piattaforma"** section
- [ ] Verify **4 metrics** display real numbers:
  1. **"X utenti registrati"** — should show actual count > 0
  2. **"Y candidature consegnate"** — with delivery proof
  3. **"Z+ offerte attive nel pool"** — refreshed every 2h
  4. **"24h prima candidatura"** — static guarantee
- [ ] All numbers formatted with Italian locale (e.g., "1.234")
- [ ] Caveat text under each metric visible
- [ ] Link to `/proof` at bottom of section

#### Step 2: Testimonials section
- [ ] Scroll through entire homepage
- [ ] **Testimonials section should NOT appear**
- [ ] No "Marco R." / "Giulia S." / "Andrea C." placeholder cards
- [ ] Section cleanly hidden (not broken/error)

#### Step 3: Verify metrics refresh
```bash
# In production console or DB query tool:
SELECT 
  COUNT(*) FILTER (WHERE "emailVerified" IS NOT NULL) as users,
  (SELECT COUNT(*) FROM "Application" WHERE "submitConfirmation" LIKE 'DETECTED%') as delivered,
  (SELECT COUNT(*) FROM "Job" WHERE "closedAt" IS NULL AND "cachedAt" >= NOW() - INTERVAL '30 days') as jobs
FROM "User";
```
- [ ] Numbers match what's displayed on homepage (±1 for timing)

### 3. Test `/analizza-cv` Landing Page

**URL:** https://lavorai.it/analizza-cv

- [ ] Page loads correctly
- [ ] CTAs link to `/optimize` (existing behavior)
- [ ] All links work (no 404s)
- [ ] Italian copy intact

### 4. Regression Testing

#### Existing user flow unchanged
- [ ] Existing users can still login normally
- [ ] `/onboarding` flow works for new users without staged CV
- [ ] Upload CV manually on `/onboarding` still works
- [ ] `/optimize` still usable without magic link (can retry with new email)

#### Free audit limit
- [ ] 3 free audits still enforced (if implemented)
- [ ] No breaking changes to credit system

#### Design system
- [ ] No visual regressions on `/optimize`
- [ ] No layout shifts on homepage
- [ ] Mobile responsive (test on 375px viewport)

### 5. Edge Cases

#### Marketing consent edge cases
- [ ] Submit form without checking marketing consent → `marketingConsent = false`
- [ ] Submit twice with same email → latest consent value wins (upsert)
- [ ] Login from different device → marketing consent persists cross-device

#### Metrics edge cases
- [ ] If no users → displays "0 utenti registrati" (graceful)
- [ ] If DB query fails → fallback to `[0, 0, 0, 0]` (no crash)
- [ ] If testimonials array has 1 item → section appears with 1 card

## Success Criteria

✅ **Goal 1: Lead Magnet Acquisition**
- [ ] Email capture gates full result (already working)
- [ ] Marketing consent checkbox functional and optional
- [ ] Clear CTA to complete signup with email prefilled
- [ ] Soft Pro upgrade CTA visible but not pushy
- [ ] Free audit flow not broken

✅ **Goal 2: Real Social Proof**
- [ ] No fake testimonials visible on homepage
- [ ] Live user count displayed from DB
- [ ] All metrics traceable to `/proof` or real data
- [ ] No "2.000+ candidati" placeholder copy anywhere

## Rollback Plan

If issues found in production:

```bash
# 1. Revert PR
git revert <commit-hash>
git push origin main

# 2. Or rollback DB (if migration breaks)
npx prisma migrate resolve --rolled-back <migration-name>
```

## Post-Deploy Tasks

1. **Monitor metrics:**
   - Check `/proof` for delivery counts
   - Verify homepage metrics update hourly
   - Monitor user signups with `marketingConsent = true`

2. **Future: Collect real testimonials**
   - Reach out to 5-10 satisfied users
   - Get opt-in for using their testimonials
   - Update `src/lib/marketing-content.ts` with real quotes
   - Uncomment `TESTIMONIALS` array

3. **Future: Marketing campaigns**
   - Build email campaign flow for users with `marketingConsent = true`
   - Integrate with Resend broadcasts
   - GDPR compliance: easy unsubscribe link

## Notes

- **Italian product:** All copy remains in Italian (primary language)
- **No Playwright changes:** Zero risk to worker deployment
- **Design system:** Uses existing components, no new CSS
- **Database migration required:** Run `npx prisma migrate deploy` in production

---

**PR Ready:** ✅ Yes, pending verification on preview deploy
**Breaking Changes:** ❌ No
**Migration Required:** ✅ Yes (adds 2 boolean columns)
**Estimated Testing Time:** 20-30 minutes
