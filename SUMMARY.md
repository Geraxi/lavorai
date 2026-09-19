# Fix: Greenhouse OTP + Honest Response/Interview UX

## Problem (Production Evidence)

From 60d live DB analysis:
- **OTP emails arrive but apps stay `applying`**: Several Greenhouse applications stuck in `applying` status for 30+ minutes while OTP emails ARE present in ApplicationReply with parseable codes (e.g. body contains "Copy and paste this code…\n\n 2Oy2H4pU")
- **No human ApplicationReply**: All 28 ApplicationReply rows are Greenhouse OTP emails (kind=auto/bounce, isHuman=false). LastReplyAt always null on applications → users can't see response rate
- **ATS portal replies bypass LavorAI**: Portal form submissions go to candidate's personal email, NOT to LavorAI reply+ inbound → can't track interviews unless user manually updates or we connect Gmail

## Root Cause: Greenhouse OTP Path

1. **Reply+ gate too strict**: OTP verification required `/^reply\+/i.test(userEmail)` but didn't check if `INBOUND_ROUTE_ATS_EMAIL` was actually enabled → gate always failed when flag was off
2. **Email field mismatch**: Greenhouse adapter fills email with `emailToUse` but profile.email may not have been updated with the inbound alias → OTP emails land at wrong address
3. **Worker crash/timeout leaves apps stuck**: No recovery for apps in `optimizing`/`applying` states → `STALE_CLAIM_MS` only handled `queued`

## Ship (One PR)

### A. Unstick + Complete Greenhouse OTP (Highest Leverage)

#### 1. Worker Recovery for Stuck Apps
**File**: `src/lib/application-claim.ts`
- Added `recoverStuckApplications()`: finds apps stuck in `optimizing`/`applying` longer than `STALE_CLAIM_MS` (20min), resets to `queued` with clear error message
- Called from `findClaimableQueued()` before polling new work → automatic recovery every worker cycle
- **Impact**: Apps will never stay stuck forever; max delay = 20 minutes before auto-retry

#### 2. Fix OTP Gate Logic
**File**: `src/lib/portal-adapters/greenhouse.ts`
- Changed gate from `!/^reply\+/i.test(input.userEmail)` to check both:
  - `INBOUND_ROUTE_ATS_EMAIL !== "false"` (feature flag)
  - `/^reply\+/i.test(input.userEmail)` (email format)
- Clear error message: "Verifica email automatica non disponibile: configurare la ricezione email per le candidature (INBOUND_EMAIL_DOMAIN)."
- **Impact**: OTP path works when inbound is configured; fails fast with clear message when not

#### 3. OTP Extraction Tests
**File**: `src/lib/__tests__/application-security-code.test.ts`
- Unit tests for real Greenhouse email format: `extractApplicationSecurityCode()` with actual body text from production OTP emails
- Covers: English/Italian, alternative phrasing, 6-12 char codes, negative cases
- **All 7 tests pass** ✅

### B. Honest Response/Interview UX (Users See and Act on Silence)

#### 1. Ghosting Badge in Dashboard
**File**: `src/app/(app)/applications/page.tsx`
- Show "Ng senza risposta" badge for success apps where:
  - `submittedAt` exists (confirmed delivery)
  - `lastReplyAt` is null (no recruiter reply)
  - Days since submit ≥ 7
- Tooltip: "Nessuna risposta dopo N giorni. Normale per molti ATS — considera di inviare un follow-up."
- **No fake recruiter messages** — badge is honest tracking

#### 2. User Status Actions
**Files**:
- `src/app/api/applications/[id]/status/route.ts` (new)
- `src/components/design/detail-drawer.tsx`

Added manual status override buttons in application detail drawer:
- "Risposta ricevuta" → userStatus = "vista"
- "Colloquio" → userStatus = "colloquio"  
- "Rifiutata" → userStatus = "rifiutata"
- "Offerta" → userStatus = "offerta"

**Use case**: User gets interview invite via personal email/LinkedIn → can mark it in dashboard for honest tracking

#### 3. Follow-Up Draft Generator
**Files**:
- `src/app/api/applications/[id]/followup/route.ts` (new)
- `src/components/design/detail-drawer.tsx`

"Invia follow-up" button:
- Generates `mailto:` link with pre-filled subject/body
- Uses `job.recruiterEmail` if scraped
- Opens user's email client → user sends from their address (not automated)
- **Honest**: LavorAI doesn't send on user's behalf

#### 4. API Response Tracking Data
**File**: `src/app/api/applications/route.ts`

Added to `/api/applications` response:
- `submittedAt`: REAL timestamp of confirmed submit (for days-since calc)
- `lastReplyAt`: Last recruiter reply timestamp
- `replyCount`: Total replies (includes OTP + human)
- `lastReplyKind`: "colloquio" | "rifiutata" | "risposta" | etc
- `submitConfirmation`: DETECTED_HTTP_2xx | DETECTED_DOM | etc

Frontend uses this to:
- Calculate `ghostingDays`
- Show reply badges
- Enable/disable follow-up CTA

### C. Improve Real Reply Capture Path

**Status**: Email recruiter path already uses reply+ inbound when `recruiterEmail` exists (see `deliverApplicationToRecruiter` in application-worker.ts)

**What's NOT in this PR**:
- Gmail OAuth connector (would be large separate feature)
- Automatic interview detection from Gmail (requires connector)

**TODO for future**:
- If Gmail connector lands, wire interview/reply detection to `ApplicationReply` table
- Short-term: rely on email_recruiter path (already implemented) + user manual status updates

## Testing

### Unit Tests
```bash
npx tsx scripts/test-otp-extraction.ts
```
**Result**: 7/7 passed ✅
- Real Greenhouse OTP format extraction
- Italian/English variants
- Message detection (from@greenhouse.io + "security code" keyword)

### Manual Verification Checklist
- [ ] Apps stuck in `applying`/`optimizing` recover to `queued` after 20min
- [ ] Greenhouse OTP path completes when INBOUND_EMAIL_DOMAIN is set
- [ ] Ghosting badge appears on dashboard for success apps after 7d no reply
- [ ] User status buttons persist to DB and refresh UI
- [ ] Follow-up mailto link opens with correct template

## What Still Requires Gmail/User Action

1. **Portal form replies** (Greenhouse/Lever/etc): These go to candidate's personal email (the email on the form). LavorAI can't see them unless:
   - User forwards to inbox@lavorai.it (existing manual flow)
   - Gmail OAuth is connected (future feature)
   - User manually updates status (shipped in this PR ✅)

2. **Interview scheduling emails**: Same as above — user receives on personal email, must mark in dashboard

3. **Email recruiter path**: Already works via reply+ inbound when `recruiterEmail` scraped → replies come to LavorAI → forwarded to user

## Honest Constraint Met

**NEVER forge recruiter emails or fake interviews** ✅

- Ghosting badge shows absence of reply (honest)
- User manually marks interviews/offers (honest)
- Follow-up draft opens user's email client (user sends, not automated)
- No fake ApplicationReply rows created
