# Gmail Inbox Integration - Implementation Summary

## Overview

Successfully rebuilt LavorAI `/inbox` as a real two-pane email client powered by Gmail, matching the AIApply screenshot UX reference. Users can now connect their Gmail account to see recruiter responses from their personal inbox, automatically classified and linked to their applications.

## What Was Built

### 1. Google OAuth + Gmail Connection ✅

**File:** `src/lib/auth.ts`

- Extended Google OAuth provider to request `gmail.readonly` scope
- Configured for offline access (`access_type: offline`) to enable background sync
- Added `prompt: consent` to ensure refresh tokens are always granted
- Tokens stored in existing NextAuth `Account` table

**Empty State:** When Gmail not connected, shows clear CTA "Collega Gmail"

### 2. Gmail API Client ✅

**File:** `src/lib/gmail-client.ts`

Key functions:
- `getGmailAccessToken(userId)` - Retrieves valid access token, auto-refreshes if expired
- `syncGmailMessages(userId, maxMessages)` - Fetches recent Gmail messages, classifies, and stores
- `hasGmailConnected(userId)` - Checks if user has Gmail OAuth tokens

**Features:**
- Fetches up to 100 messages per sync (respects Gmail API quota)
- Filters for job-related mail using heuristics:
  - Known ATS domains (Greenhouse, Lever, Workable, etc.)
  - Recruiter email patterns (recruiting@, talent@, hr@, etc.)
  - Job keywords in subject/body
- Classifies using existing `reply-parser.ts` logic
- Matches messages to Applications by company name/domain
- Deduplicates by Gmail `messageId`

### 3. API Endpoints ✅

**Files:**
- `src/app/api/gmail/sync/route.ts` - POST endpoint to trigger manual sync
- `src/app/api/gmail/status/route.ts` - GET endpoint to check connection status

### 4. Database Schema ✅

**File:** `prisma/schema.prisma`

**New Model:** `GmailMessage`
```prisma
model GmailMessage {
  id             String      @id @default(cuid())
  userId         String
  gmailMessageId String      // Gmail's permanent message ID
  threadId       String?
  fromAddress    String
  toAddress      String?
  subject        String?
  snippet        String?
  bodyText       String?     @db.Text
  date           DateTime
  kind           String      // colloquio | rifiutata | risposta | ricevuta | auto | bounce
  isHuman        Boolean     @default(true)
  applicationId  String?     // Optional link to Application
  label          String?     // User-facing label
  read           Boolean     @default(false)
  archived       Boolean     @default(false)
  syncedAt       DateTime    @default(now())
  createdAt      DateTime    @default(now())

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  application Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)

  @@unique([userId, gmailMessageId])
  @@index([userId, date])
  @@index([userId, read])
  @@index([applicationId])
}
```

**Relations Added:**
- `User.gmailMessages` - One-to-many relation
- `Application.gmailMessages` - One-to-many relation

### 5. AIApply-style Inbox UI ✅

**File:** `src/components/gmail-inbox-view.tsx`

**Layout:**
- Two-pane design: message list (left) + detail view (right)
- Gmail-style visual hierarchy

**Header:**
- "Inbox" title
- Connected email address dropdown
- Interview invitations badge (purple pill)

**Left Pane:**
- Search bar with icon
- Filter buttons: Inbox, Unread only
- Label buttons with color dots:
  - 🟢 Interview invitation (green)
  - 🔵 Application Confirmation (blue)
  - 🔴 Not this time (red)
- Action buttons: Mark all read, Refresh
- Newest sort indicator
- Message list with:
  - Avatar (first letter of sender)
  - From, subject, snippet
  - Date (relative: "14:30" or "7 Jun")
  - Label pill with color
  - Unread dot (purple)
  - Selected state: purple left border + sunken background

**Right Pane:**
- Message header:
  - Subject (large, bold)
  - From + timestamp
  - Label pill
- Action buttons:
  - View Application (when matched to Application)
  - Reply
  - Forward
  - Delete
- Company card (when matched):
  - Company logo
  - Company name + job title
- Full message body (pre-wrapped text)

**Pagination Footer:**
- "1–N of N" counter
- Previous/Next buttons (disabled in v1)

### 6. Page Integration ✅

**File:** `src/app/(app)/inbox/page.tsx`

- Checks if Gmail connected via `hasGmailConnected()`
- If not connected: shows empty state with "Collega Gmail" CTA
- If connected: fetches `GmailMessage` records from DB
- Passes messages + metadata to `GmailInboxView` component
- Counts interview invitations for header badge

### 7. Icons ✅

**File:** `src/components/design/icon.tsx`

Added missing icons:
- `mail` - Email envelope
- `circle` - Unread indicator
- `reply` - Reply arrow
- `corner-up-right` - Forward arrow
- `trash-2` - Delete icon
- `file-text` - Document icon
- `chevron-left` - Pagination arrow
- `arrow-down` - Sort indicator
- `refresh-cw` - Refresh icon

### 8. Testing ✅

**File:** `tests/gmail-classifier.test.ts`

**8 smoke tests (all passing):**
1. Interview invitation (English) - detects "schedule a call", "available"
2. Interview invitation (Italian) - detects "colloquio", "disponibile"
3. Rejection (English) - detects "unfortunately", "other candidates"
4. Rejection (Italian) - detects "purtroppo", "non possiamo procedere"
5. Application confirmation (ATS) - detects "application received" from noreply@
6. Out of office (auto-reply) - detects "out of office"
7. Bounce (mailer-daemon) - detects "delivery status notification"
8. Generic recruiter response - default to "risposta"

**Run tests:**
```bash
npx tsx tests/gmail-classifier.test.ts
```

### 9. Documentation ✅

**Created:**
- `docs/GMAIL_SETUP.md` - Comprehensive Google Cloud Console setup guide
- `docs/MIGRATION_GMAIL.md` - Database migration guide + rollback instructions
- Updated `.env.example` with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

**Deprecated:**
- `src/components/inbox-view.tsx` - Marked deprecated, kept as backup

## Architecture Decisions

### Why Gmail API (not IMAP)?
- Gmail API provides structured data (message IDs, thread IDs, snippets)
- Better quota management and rate limiting
- OAuth token refresh built-in
- Official Google SDK available

### Why Store Messages in DB?
- Fast UI (no API call on every page load)
- Enables search/filter without hitting Gmail API
- Classification stored once (not recalculated)
- Supports offline features in future

### Why Reuse reply-parser.ts?
- Already battle-tested for ApplicationReply classification
- Consistent classification logic across inbound sources
- Reduces maintenance burden

### Why Separate GmailMessage from ApplicationReply?
- Different data sources (Gmail API vs Resend webhook)
- Different schemas (Gmail has threadId, snippet, etc.)
- Allows evolution of each independently
- Cleaner separation of concerns

## Security Considerations

### OAuth Scopes
- `gmail.readonly` - Read-only access, cannot send or modify emails
- User can revoke access anytime via Google Account settings

### Token Storage
- Access tokens stored in `Account` table (encrypted at rest in DB)
- Refresh tokens enable background sync without user present
- Tokens auto-refresh before expiration

### Data Privacy
- Only syncs INBOX label (not sent, drafts, spam)
- Only stores job-related mail (filtered by heuristics)
- Filters out auto-replies and bounce messages
- No email content sent to third-party services (classification runs server-side)

## Performance

### Gmail API Quotas
- Default: 1 billion quota units per day
- List messages: 5 units per request
- Get message: 5 units per request
- Estimated: ~100 syncs/day/user before hitting quota (conservative)

### Database Queries
- Indexed by `userId` + `date` for fast chronological fetch
- Indexed by `userId` + `read` for unread filter
- Indexed by `applicationId` for reverse lookup
- Unique constraint on `userId` + `gmailMessageId` for dedup

### Sync Strategy
- Manual refresh only (v1)
- Future: Cron job every 6-12 hours
- Future: Gmail push notifications (real-time via Cloud Pub/Sub)

## Production Deployment Checklist

### Google Cloud Console (before deploy)
- [ ] Enable Gmail API
- [ ] Configure OAuth consent screen with scopes
- [ ] Create OAuth 2.0 credentials (Web application)
- [ ] Add production redirect URI: `https://lavorai.it/api/auth/callback/google`

### Vercel Environment Variables
- [ ] `GOOGLE_CLIENT_ID` - OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - OAuth client secret
- [ ] `DATABASE_URL` - Postgres connection string (pooled)
- [ ] `DIRECT_URL` - Postgres connection string (direct, for migrations)

### Database Migration
- Schema changes apply automatically via `prisma db push` in build script
- No manual migration required

### Testing After Deploy
- [ ] Sign in with Google → verify OAuth consent screen shows Gmail scope
- [ ] Navigate to `/inbox` → verify empty state if not connected
- [ ] Click "Collega Gmail" → verify OAuth flow completes
- [ ] Click "Refresh" → verify messages appear
- [ ] Verify classification labels (Colloquio, Rifiutata, etc.)
- [ ] Verify "View Application" link works for matched messages

## Known Limitations (v1)

1. **Manual Sync Only** - No automatic background sync yet (future: cron job)
2. **Limited Message Count** - Only fetches last 100 messages per sync
3. **No Pagination** - UI shows all messages, no "load more" (future enhancement)
4. **No Push Notifications** - No real-time updates when new email arrives
5. **Reply/Forward Buttons** - UI only, no actual send (future: mailto or Gmail web link)
6. **No Bulk Operations** - Can't mark multiple messages read at once
7. **No Threading** - Messages shown flat, not grouped by Gmail thread

## Future Roadmap

### Phase 2: Automation
- [ ] Cron job for automatic background sync (every 6-12 hours)
- [ ] Gmail push notifications via Cloud Pub/Sub (real-time updates)

### Phase 3: Advanced Features
- [ ] Pagination for older messages (load more)
- [ ] Bulk mark read/archive operations
- [ ] Reply/Forward actions (open Gmail web or compose mailto)
- [ ] Thread view (group messages by Gmail threadId)

### Phase 4: Intelligence
- [ ] AI-powered response suggestions (draft replies to recruiter messages)
- [ ] Sentiment analysis (positive/negative tone detection)
- [ ] Priority inbox (rank by likelihood of interview/offer)

## Metrics to Track Post-Deploy

1. **Connection Rate:** % of users who connect Gmail
2. **Sync Success Rate:** % of syncs that succeed without errors
3. **Classification Accuracy:** Manual review of sample messages
4. **Match Rate:** % of messages successfully matched to Applications
5. **Engagement:** % of users who return to inbox after first sync

## Support & Troubleshooting

Common issues documented in `docs/GMAIL_SETUP.md`:
- "Gmail not connected" despite signing in
- No messages syncing
- Token refresh errors
- OAuth consent screen issues

## Summary Statistics

- **Files Created:** 7
- **Files Modified:** 6
- **Lines of Code Added:** ~1,500
- **Tests Written:** 8 (all passing)
- **Documentation Pages:** 2 (setup guide + migration guide)
- **Database Models Added:** 1 (GmailMessage)
- **API Endpoints Added:** 2 (sync + status)
- **Icons Added:** 9

---

**Pull Request:** https://github.com/Geraxi/lavorai/pull/14  
**Status:** ✅ Ready for review  
**Breaking Changes:** None (additive feature)  
**Test Coverage:** 8/8 classifier tests passing
