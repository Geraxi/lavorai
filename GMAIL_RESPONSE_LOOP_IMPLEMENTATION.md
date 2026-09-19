# Gmail Response Loop Fix - Implementation Summary

## Overview
Fixed the Gmail response funnel for LavorAI users by applying recruiter replies from personal Gmail to Applications and adding background sync.

## Problem Statement
- Gmail sync was manual only (`POST /api/gmail/sync`)
- Synced `GmailMessage` rows were not written into Application response fields
- Most recruiter responses go to users' personal Gmail, not LavorAI inbound
- Ghosting badges remained even after recruiter replied

## Solution Components

### 1. Shared Apply-Reply Logic (`src/lib/apply-reply-to-application.ts`)
**Purpose**: DRY principle - single source of truth for applying recruiter replies to Applications

**Features**:
- Updates `lastReplyAt`, `lastReplyKind`, `replyCount`, `userStatus`
- Respects status hierarchy (doesn't downgrade `colloquio` → `risposta`)
- Handles all reply kinds: `colloquio`, `rifiutata`, `risposta`, `ricevuta`, `auto`, `bounce`
- Used by both inbound webhook and Gmail sync

**Key Logic**:
```typescript
if (isHuman) {
  // Human reply: update all fields, set userStatus if appropriate
  // Don't downgrade advanced statuses (offerta, colloquio)
} else if (kind === "ricevuta") {
  // Confirmation: mark as "vista", increment count
} else {
  // auto/bounce: just increment count, no status change
}
```

### 2. Gmail Client Updates (`src/lib/gmail-client.ts`)
**Changes**:
- Import `applyReplyToApplication` helper
- After storing `GmailMessage`, check if human reply and matched to Application
- If both conditions met, apply the reply to the Application
- Idempotency ensured by existing message duplicate check (line 320-327)

**Flow**:
```
1. Fetch Gmail messages (up to maxMessages)
2. For each message:
   a. Check if already synced (skip if yes) ← IDEMPOTENCY
   b. Fetch full message details
   c. Filter for job-related mail
   d. Classify message (colloquio/rifiutata/risposta/auto/bounce)
   e. Try to match to Application
   f. Store GmailMessage
   g. If matched AND human: applyReplyToApplication() ← NEW
```

### 3. Inbound Webhook Refactor (`src/app/api/webhooks/resend/route.ts`)
**Changes**:
- Removed inline Application update logic (lines 165-201)
- Replaced with call to `applyReplyToApplication` helper
- Same behavior, cleaner code
- Security code skip logic preserved (line 162)

### 4. Background Gmail Sync Cron (`src/app/api/cron/gmail-sync/route.ts`)
**Purpose**: Automatically sync Gmail for all connected users

**Features**:
- Protected by `CRON_SECRET` (same pattern as auto-apply cron)
- Finds all users with Google Account tokens
- Syncs up to 50 recent messages per user
- Rate-limited: 1.1s delay between users (respects Gmail API quota)
- Logs failures per user without aborting entire run
- Returns detailed stats: `usersChecked`, `usersWithGmail`, `totalSynced`, `totalSkipped`, `errors[]`

**Gmail API Quota Math**:
- Gmail API: 250 quota units per user per second
- List call: 5 units, Get call: 5 units
- 50 messages = 1 list + 50 gets = 255 units
- Therefore: need ≥1 second between users → 1.1s chosen

### 5. GitHub Actions Workflow (`.github/workflows/cron-gmail-sync.yml`)
**Schedule**: 4 times per day at off-peak hours
- 06:00 UTC (07:00/08:00 IT) - Early morning
- 11:00 UTC (12:00/13:00 IT) - Midday
- 15:00 UTC (16:00/17:00 IT) - Afternoon
- 20:00 UTC (21:00/22:00 IT) - Evening

**Why GitHub Actions**: Vercel Hobby plan doesn't support cron jobs, so we use the same pattern as the existing auto-apply cron

### 6. Tests

#### Unit Tests (`tests/gmail-reply-unit.test.ts`)
No database required, tests classification logic:
- ✅ OTP/security codes classified as `auto` (not human)
- ✅ Interview invitations classified as `colloquio` (human)
- ✅ Rejections classified as `rifiutata` (human)
- ✅ Generic responses classified as `risposta` (human)
- ✅ Auto-replies classified as `auto` (not human)
- ✅ Bounces classified as `bounce` (not human)
- ✅ Confirmations classified as `ricevuta` (not human)

#### Integration Tests (`tests/apply-reply.test.ts`)
Requires database, tests end-to-end flow:
- ✅ OTP emails don't set human reply fields
- ✅ Human replies update Application correctly
- ✅ Duplicate sync doesn't double-increment (idempotency)
- ✅ Status transitions preserve hierarchy (colloquio > risposta)

#### Existing Tests
- ✅ All Gmail classifier tests pass (`tests/gmail-classifier.test.ts`)

## Idempotency Strategy
**Problem**: What if we sync the same Gmail message twice?

**Solution**: Idempotency handled at the sync level (not in `applyReplyToApplication`)

**Implementation**:
```typescript
// In syncGmailMessages (gmail-client.ts:320-327)
const existing = await prisma.gmailMessage.findUnique({
  where: { userId_gmailMessageId: { userId, gmailMessageId: msgRef.id } },
});
if (existing) {
  skipped++;
  continue; // Don't process this message again
}
```

This ensures:
1. Each unique Gmail message is stored once
2. Each unique Gmail message triggers Application update once
3. Re-running sync is safe (won't double-increment `replyCount`)

## UX Impact
**Before**:
- User applies via LavorAI
- Recruiter replies to user's personal Gmail
- Application still shows "ghosting" badge
- User manually updates status or sees it in inbox

**After**:
- User applies via LavorAI
- Recruiter replies to user's personal Gmail
- Background sync detects reply (within 4-5 hours)
- Application automatically updated:
  - `lastReplyAt` set → ghosting badge clears
  - `lastReplyKind` = "colloquio"/"rifiutata"/"risposta"
  - `userStatus` = "colloquio"/"rifiutata"
  - `replyCount` incremented
- User sees accurate status in Applications list

## Deployment Checklist
- [x] Code merged to main
- [x] `CRON_SECRET` exists in GitHub Actions secrets
- [x] GitHub Actions workflow enabled
- [x] No database migrations needed (uses existing schema)
- [x] Manual Gmail sync still works (`POST /api/gmail/sync`)
- [x] No NextAuth regression (Gmail connect flow untouched)

## Monitoring
Check cron job status:
- GitHub Actions: `Actions` tab → `gmail-sync cron`
- Logs show: `usersChecked`, `usersWithGmail`, `totalSynced`, `totalSkipped`, `errors[]`

Manual trigger for testing:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://lavorai.it/api/cron/gmail-sync
```

## Future Improvements
1. **Real-time webhook**: Gmail push notifications for instant updates (instead of 4x daily polling)
2. **Reply threading**: Link GmailMessage to ApplicationReply when same thread
3. **Smart scheduling**: Increase sync frequency after recent application sends
4. **User notification**: "You have a new interview invitation!" push/email
5. **Better matching**: ML-based company name matching (current is heuristic)

## Related Files
- `src/lib/apply-reply-to-application.ts` - Core logic
- `src/lib/gmail-client.ts` - Gmail sync + matcher
- `src/lib/reply-parser.ts` - Classification (unchanged)
- `src/app/api/webhooks/resend/route.ts` - Inbound webhook
- `src/app/api/cron/gmail-sync/route.ts` - Background sync
- `.github/workflows/cron-gmail-sync.yml` - GitHub Actions
- `tests/gmail-reply-unit.test.ts` - Unit tests
- `tests/apply-reply.test.ts` - Integration tests

## PR
https://github.com/Geraxi/lavorai/pull/20
