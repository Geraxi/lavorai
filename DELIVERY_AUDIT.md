# LavorAI Application Delivery Flow Audit

## Executive Summary

**Primary Issue**: Applications are NOT reaching real recruiters. The delivery chain has **multiple critical breaks** that prevent users from getting recruiter responses.

## End-to-End Flow Analysis

### 1. SIGNUP → CV → PROFILE ✅ (Working)
- NextAuth email magic link → Working
- CV upload & parsing → Working  
- Onboarding wizard → Working
- **Status**: This part is functional

### 2. JOB DISCOVERY & MATCHING ⚠️ (Partially Broken)

**How it works**:
- Jobs sourced from Adzuna API (`src/lib/adzuna.ts`)
- Fallback to mock jobs if no Adzuna keys configured
- Jobs cached in PostgreSQL `Job` table

**Problems**:
- ✅ Adzuna API integration code exists
- 🔴 **CRITICAL**: Adzuna keys likely not configured in production
  - Check: `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in Vercel env vars
  - Without these, users see only mock/stale jobs
- 🔴 **CRITICAL**: Aggregator jobs (Adzuna, Indeed, LinkedIn) rarely contain direct recruiter email
  - `Job.recruiterEmail` column exists but likely NULL for most jobs
  - Code tries to scrape recruiter email from job page (`src/lib/recruiter-email.ts`)
  - Scraping is opportunistic and fails on ATS systems

**Evidence from code**:
```typescript
// src/lib/recruiter-email.ts
export async function findVerifiedRecruiterEmail(
  jobUrl: string,
  company: string | null,
  ...
): Promise<VerifiedRecruiterEmail | null>
```
This function tries to scrape email from job HTML but has extensive blacklists (no-reply, info, support, privacy, etc.) and will return `null` for most postings.

### 3. APPLICATION SUBMISSION 🔴 (BROKEN)

**Delivery paths in order of preference** (`src/lib/application-worker.ts`):

#### Path A: Direct Email to Recruiter (email_recruiter)
```typescript
// Line ~595-610 in application-worker.ts
const verifiedRecruiter = await findVerifiedRecruiterEmail(...);
if (verifiedRecruiter) {
  // Skip portal, send email directly
}
```

**Status: 🔴 BROKEN** because:
1. Recruiter emails rarely present in Adzuna feed
2. Scraping from job pages fails on ATS systems (Greenhouse, Lever, etc.)
3. Even if scraped, requires:
   - `RECRUITER_EMAIL_FALLBACK_ENABLED=true` (may not be set)
   - `APPLICATIONS_PAUSED` not set (current state unknown)
   - Valid `RESEND_API_KEY` configured
   - `EMAIL_FROM` NOT sandbox (currently unknown)

**Guardrail that BLOCKS delivery** (`src/lib/application-worker.ts:2073-2091`):
```typescript
if (
  process.env.NODE_ENV === "production" &&
  from.toLowerCase().includes("resend.dev")
) {
  console.error(
    `RECRUITER_EMAIL_FROM is sandbox Resend (${from}) — no delivery possible`
  );
  return { kind: "not_sent", reason: "email_provider_not_configured" };
}
```

This HARD BLOCKS all production delivery if `EMAIL_FROM` is still `onboarding@resend.dev` (the sandbox default).

#### Path B: Portal Automation (Playwright)
- Code for Greenhouse, Lever, Workable, Recruitee adapters exists
- **Status: 🟡 REQUIRES TESTING** - not evaluated in this audit

#### Path C: Manual Handoff
- Shows user "Apply manually" if both A & B fail
- **Status: ✅ WORKS but defeats automation promise**

### 4. EMAIL DELIVERY INFRASTRUCTURE 🔴 (LIKELY BROKEN)

**Requirements** (from `.env.example` and code):
1. `RESEND_API_KEY` - API key for sending
2. `EMAIL_FROM` - Sender address (MUST be verified domain, not sandbox)
3. `RESEND_WEBHOOK_SECRET` - For delivery/bounce tracking
4. `INBOUND_EMAIL_DOMAIN` - For reply routing (e.g., `inbound.lavorai.it`)

**Critical Issues**:

❌ **Domain Verification**:
- Code expects `EMAIL_FROM=candidature@lavorai.it`
- Requires DNS records (SPF, DKIM, DMARC) configured in domain DNS
- If domain not verified in Resend → emails rejected
- If still using `onboarding@resend.dev` → HARD BLOCKED (see guardrail above)

❌ **Webhook Configuration**:
- Endpoint: `https://lavorai.it/api/webhooks/resend`
- Needs webhook secret configured
- Without this: no delivery tracking, no bounce handling, no reply routing

❌ **Current Vercel Environment Status**:
```json
{
  "RESEND_API_KEY": {"visibility": "secret", "value": ""}, 
  "INBOUND_EMAIL_DOMAIN": {"visibility": "config", "value": ""},
  "RESEND_WEBHOOK_SECRET": {"visibility": "secret", "value": ""}
}
```
All three show empty/redacted values. Cannot confirm if properly configured without founder access.

### 5. INBOUND REPLY HANDLING 🔴 (BROKEN)

**How it should work**:
1. Application sent with `Reply-To: reply+<appId>@inbound.lavorai.it`
2. Recruiter replies go to Resend inbound
3. Webhook `POST /api/webhooks/resend` receives email
4. Code in `src/app/api/webhooks/resend/route.ts` processes
5. Reply stored in `ApplicationReply` table
6. User gets notification via `InboundEmail` → `UserInbox`

**Problems**:
- 🔴 Requires `INBOUND_EMAIL_DOMAIN=inbound.lavorai.it` set
- 🔴 Requires MX records for `inbound.lavorai.it` pointing to Resend
- 🔴 Requires Resend webhook configured
- 🔴 Requires `RESEND_RECEIVING_API_KEY` or fallback to sending key

**Code evidence** (`src/lib/application-worker.ts:2100-2105`):
```typescript
const inboundReply = inboundReplyAddress(input.applicationId)
  ?? (/^[a-z0-9_-]+$/i.test(input.applicationId) 
      ? `reply+${input.applicationId}@inbound.lavorai.it` 
      : null);
const effectiveReplyTo = inboundReply ?? input.replyTo;
```

If `INBOUND_EMAIL_DOMAIN` not set, falls back to user's email directly. But then:
- No automatic reply tracking
- User must manually check their own inbox
- Defeats the value prop of centralized reply management

### 6. USER NOTIFICATION 🔴 (LIKELY BROKEN)

**Notification types that users should receive**:
- Application submitted confirmation
- Recruiter replied alert
- Weekly application status digest

**Guardrails that block notifications** (`.env.example:47-66`):
```bash
# USER_NOTIFICATIONS_HOLD=true  # If set, ALL user notifications held
# USER_NOTIFICATIONS_NOT_BEFORE=2026-10-25T18:00:00+02:00
```

**Current status**: Unknown if these are set. If `USER_NOTIFICATIONS_HOLD=true`, users get ZERO feedback about their applications.

---

## Breakdown: Where the Chain BREAKS

| Stage | Status | Why Broken |
|-------|--------|------------|
| 1. Signup/CV | ✅ | Works |
| 2. Job Feed | 🔴 | Adzuna keys missing → only mock jobs |
| 3. Recruiter Email Scraping | 🔴 | Aggregator jobs lack emails; scraping fails on ATS |
| 4. Email Sending | 🔴 | Sandbox `EMAIL_FROM` blocked; domain not verified |
| 5. Delivery Tracking | 🔴 | Webhook not configured |
| 6. Inbound Replies | 🔴 | MX records & inbound domain not set |
| 7. User Notifications | 🔴 | Likely held by env guards |

---

## Technical Root Causes

### A. EMAIL_FROM Sandbox Block (Highest Priority)

**Location**: `src/lib/application-worker.ts:2073-2091`

**The Problem**:
```typescript
if (
  process.env.NODE_ENV === "production" &&
  from.toLowerCase().includes("resend.dev")
) {
  // HARD BLOCK - NO EMAILS SENT
  return { kind: "not_sent", reason: "email_provider_not_configured" };
}
```

This is a **fail-safe guardrail** the code has to prevent sending to recruiters from an unverified sandbox address. It means:
- Resend sandbox (`onboarding@resend.dev`) can only email account owner
- NO external emails possible until `lavorai.it` is verified in Resend
- ALL applications marked "not_sent" silently

### B. Missing Recruiter Contact Data

**Location**: `src/lib/recruiter-email.ts`

Jobs from Adzuna are **aggregator links** that redirect to original postings. They rarely include direct recruiter emails. The scraper tries to extract emails from the final landing page, but:

1. ATS systems (Greenhouse, Lever, etc.) hide recruiter emails
2. Many companies use generic `jobs@company.com` (blacklisted)
3. Email extraction is conservative (many false negatives to avoid spam)

**Result**: Most jobs end up with `Job.recruiterEmail = NULL`, forcing fallback to portal automation or manual handoff.

### C. Portal Automation Not Production-Ready

The codebase has Playwright adapters for:
- Greenhouse
- Lever
- Workable  
- Recruitee

But these require:
- Dedicated worker infrastructure (Railway)
- Browser automation at scale
- CAPTCHA handling
- Constant maintenance as ATS UIs change

From code comments, this is "Path A" (email) vs "Path B" (portal). Path A is preferred but broken. Path B is complex and untested at scale.

### D. Environment Configuration Gaps

**Required but potentially missing**:
1. `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` 
2. `RESEND_API_KEY` (exists but value unknown)
3. `EMAIL_FROM=candidature@lavorai.it` (currently unknown)
4. `RESEND_WEBHOOK_SECRET` (exists but value unknown)
5. `INBOUND_EMAIL_DOMAIN=inbound.lavorai.it` (exists as config key)
6. DNS records:
   - SPF: `v=spf1 include:_spf.resend.com ~all`
   - DKIM: Provided by Resend per domain
   - DMARC: `v=DMARC1; p=none; ...`
7. MX records for `inbound.lavorai.it` → Resend's servers

---

## What Code FIXES Are Needed

### 1. Remove Hard Dependency on Recruiter Email

**Current code** (`src/lib/application-worker.ts:~1014`):
```typescript
if (!skipPortal && !verifiedRecruiter && !app.job.recruiterEmail 
    && isKnownAtsCompany(app.job.company)) {
  // Falls through to "awaiting_consent" = manual
}
```

**Problem**: Too strict. Should attempt portal submit even without recruiter email for known ATS systems.

**Fix**: 
```typescript
// If job is on known ATS and we have an adapter, try portal submit first
if (!skipPortal && adapter && isKnownAtsCompany(app.job.company)) {
  // Attempt portal automation
  // Only fall back to email if portal fails
}
```

### 2. Add Fallback Generic Recruiter Email Construction

If job has company website but no recruiter email, try common patterns:
- `jobs@<company-domain>.com`
- `careers@<company-domain>.com`
- `hr@<company-domain>.com`

With validation:
- MX record exists
- Domain matches company name
- Not in blacklist

**Add to** `src/lib/recruiter-email.ts`:
```typescript
export function constructGenericRecruiterEmail(
  company: string,
  companyWebsite: string
): string | null {
  const domain = new URL(companyWebsite).hostname.replace('www.', '');
  const candidates = [`jobs@${domain}`, `careers@${domain}`, `hr@${domain}`];
  // Validate MX record, not blacklisted, etc.
  // Return first valid
}
```

### 3. Better Error Reporting to User

**Current**: Application silently marked "failed" with cryptic codes.

**Fix**: Add user-facing error messages in `src/lib/application-worker.ts`:
```typescript
if (result.kind === "not_sent" && result.reason === "email_provider_not_configured") {
  await notifyUserAboutConfigIssue(app.userId, 
    "We couldn't send your application due to email setup. Our team has been notified."
  );
  await alertFounder("email_config_blocked_application", ...);
}
```

### 4. Add Health Check Endpoint

**New file**: `src/app/api/health/delivery/route.ts`
```typescript
export async function GET() {
  const checks = {
    adzuna: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    resend_key: Boolean(process.env.RESEND_API_KEY),
    email_from_valid: process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes('resend.dev'),
    webhook_secret: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    inbound_domain: Boolean(process.env.INBOUND_EMAIL_DOMAIN),
    applications_paused: applicationsPaused(),
    recruiter_email_enabled: recruiterEmailFallbackEnabled(),
  };
  
  return Response.json({
    healthy: Object.values(checks).every(v => v === true || v === false),
    checks
  });
}
```

---

## FOUNDER ACTION CHECKLIST (Priority Order)

### ✅ CRITICAL (Do First - Blocks ALL Delivery)

- [ ] **Resend Domain Verification**
  1. Log into Resend dashboard
  2. Add domain `lavorai.it`
  3. Copy DNS records (SPF, DKIM, DMARC)
  4. Add records to domain DNS provider (e.g., Cloudflare, Namecheap)
  5. Wait for verification (usually 10-60 min)
  6. **Critical**: Set `EMAIL_FROM=candidature@lavorai.it` in Vercel

- [ ] **Verify Resend API Key**
  - Check if `RESEND_API_KEY` in Vercel is actual API key (not empty)
  - If missing: Resend Dashboard → API Keys → Create → Copy to Vercel

- [ ] **Configure Webhook**
  1. Resend Dashboard → Webhooks → Create webhook
  2. URL: `https://lavorai.it/api/webhooks/resend`
  3. Events: Select all (email.sent, email.delivered, email.bounced, email.received, etc.)
  4. Copy signing secret
  5. Add `RESEND_WEBHOOK_SECRET=<secret>` to Vercel

### ⚠️ HIGH PRIORITY (Blocks Reply Routing)

- [ ] **Inbound Email Setup**
  1. Verify `INBOUND_EMAIL_DOMAIN=inbound.lavorai.it` is set in Vercel
  2. Resend Dashboard → Domains → `lavorai.it` → Inbound
  3. Copy MX record values
  4. Add MX records for `inbound.lavorai.it` subdomain in DNS:
     ```
     inbound.lavorai.it  MX  10  mx1.resend.com
     inbound.lavorai.it  MX  20  mx2.resend.com
     ```
  5. Wait for propagation (check with `dig MX inbound.lavorai.it`)

- [ ] **Job Feed API**
  - Sign up for Adzuna: https://developer.adzuna.com (free tier)
  - Get `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`
  - Add both to Vercel environment variables
  - Without this, users only see mock/stale jobs with no real recruiter contacts

### 📋 MEDIUM PRIORITY (Feature Flags)

- [ ] **Remove Pause Guards** (if set)
  - Check Vercel env vars for:
    - `APPLICATIONS_PAUSED` → Delete if present
    - `USER_NOTIFICATIONS_HOLD` → Delete if present
    - `RECRUITER_EMAIL_FALLBACK_ENABLED` → Set to `true`

### 🔧 OPTIONAL (Code Improvements)

- [ ] Implement generic recruiter email fallback (see Fix #2 above)
- [ ] Add `/api/health/delivery` endpoint (see Fix #4 above)
- [ ] Improve error messaging to users (see Fix #3 above)
- [ ] Add Sentry or logging for "not_sent" applications

---

## Testing Plan (After Fixes)

### Phase 1: Email Infrastructure Test
```bash
# Test with Resend's test addresses
1. Create test user account
2. Upload CV
3. Find a mock job (or create test job)
4. Trigger application
5. Check Vercel logs for:
   - "sent via email_recruiter" message
   - No "sandbox Resend" error
6. Check Resend dashboard:
   - Email shows "delivered" status
   - Webhook events received
```

### Phase 2: Reply Handling Test
```bash
1. Send test application
2. In Resend dashboard, forward test to reply+<appId>@inbound.lavorai.it
3. Check webhook receives "email.received" event
4. Verify ApplicationReply row created in DB
5. Verify user sees reply in dashboard inbox
```

### Phase 3: Real Job Test
```bash
1. Enable Adzuna API
2. Search for job on platform
3. Check job has real recruiter email or ATS adapter
4. Submit application
5. Monitor through completion
6. Verify delivery evidence in DB (ApplicationEmailAttempt table)
```

---

## Metrics to Monitor

Add to dashboard:
1. **Job Feed Health**: `COUNT(jobs WHERE recruiterEmail IS NOT NULL) / COUNT(jobs)`
2. **Application Success Rate**: `COUNT(applications WHERE status='success') / COUNT(applications)`
3. **Email Acceptance Rate**: `COUNT(emailAttempts WHERE status='accepted') / COUNT(emailAttempts)`
4. **Delivery Rate**: `COUNT(emailAttempts WHERE status='delivered') / COUNT(emailAttempts WHERE status='accepted')`
5. **Reply Rate**: `COUNT(DISTINCT applicationId FROM replies) / COUNT(applications WHERE status='success')`

Expected healthy values:
- Job Feed Health: >5% (most aggregator jobs lack emails)
- Application Success: >80%
- Email Acceptance: >95%
- Delivery Rate: >90%
- Reply Rate: 1-10% (industry standard for cold applications)

---

## The SINGLE BIGGEST Blocker

**`EMAIL_FROM` still set to sandbox `onboarding@resend.dev`**

This one env var blocks:
- ❌ All email delivery to recruiters
- ❌ All application confirmations to users
- ❌ All inbound reply notifications

Until `lavorai.it` is verified in Resend and `EMAIL_FROM=candidature@lavorai.it` is set in Vercel, **ZERO emails reach external recipients**.

The code has an explicit fail-safe guard for this at `src/lib/application-worker.ts:2073-2091`.

---

## Summary Table

| Component | Current State | Required State | Fix Required? |
|-----------|---------------|----------------|---------------|
| Adzuna API | ❓ Unknown | Configured with valid keys | ✅ Yes |
| Resend API Key | ❓ Unknown | Valid API key | ✅ Maybe |
| EMAIL_FROM | ❓ Unknown | `candidature@lavorai.it` | ✅ YES - CRITICAL |
| Domain Verification | ❓ Unknown | DNS records configured | ✅ YES - CRITICAL |
| Webhook Secret | ❓ Unknown | Valid secret | ✅ YES - HIGH |
| Inbound Domain | ✅ Configured | `inbound.lavorai.it` | ✅ YES - MX records |
| MX Records | ❓ Unknown | Pointing to Resend | ✅ YES - HIGH |
| Application Pause | ❓ Unknown | Not set/false | ✅ Maybe |
| Recruiter Email Fallback | ❓ Unknown | Enabled | ✅ Maybe |

**Next Steps**: 
1. Founder must access Vercel dashboard and check actual env var values
2. Follow CRITICAL checklist items above
3. Run test flow with real email delivery
4. Monitor Resend dashboard for delivery confirmations
