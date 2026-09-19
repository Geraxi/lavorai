# Gmail Inbox Integration Setup

This document describes the steps required to enable Gmail integration in LavorAI production.

## Overview

The Gmail integration allows users to:
- Connect their Gmail account via Google OAuth
- See recruiter responses from their personal Gmail inbox
- Automatically classify emails (interview invitations, rejections, application confirmations)
- Link Gmail messages to existing LavorAI applications when possible

## Prerequisites

- Google Cloud Console project
- LavorAI production environment variables configured

## Google Cloud Console Setup

### 1. Enable Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one if needed)
3. Navigate to **APIs & Services** → **Library**
4. Search for "Gmail API"
5. Click **Enable**

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (or Internal if G Workspace)
3. Fill in required fields:
   - App name: **LavorAI**
   - User support email: your support email
   - Developer contact email: your developer email
4. Click **Save and Continue**
5. On **Scopes** screen, click **Add or Remove Scopes**
6. Add the following scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` (Read Gmail messages)
   - `openid`
   - `email`
   - `profile`
7. Click **Update** and **Save and Continue**
8. Add test users if app is in testing mode
9. Click **Save and Continue**

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application** as application type
4. Name: **LavorAI Web Client**
5. **Authorized JavaScript origins**:
   - `https://lavorai.it` (production domain)
   - `http://localhost:3000` (for local testing)
6. **Authorized redirect URIs**:
   - `https://lavorai.it/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### 4. Configure Environment Variables

Add the following to your production environment (Vercel/Railway):

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

These are already used by NextAuth for Google sign-in; the Gmail integration extends the same OAuth flow with additional scopes.

## User Flow

### First-time Connection

1. User signs in with Google (or already has a Google account linked)
2. User navigates to `/inbox`
3. If Gmail not connected, they see a "Collega Gmail" CTA
4. Clicking the button triggers Google OAuth with Gmail scopes
5. User grants permission for LavorAI to read their Gmail (readonly)
6. On success, redirect back to `/inbox` and trigger first sync

### Ongoing Usage

1. User opens `/inbox` to see their classified Gmail messages
2. Click **Refresh** to manually sync new messages
3. (Future) Cron job syncs Gmail automatically every N hours

## Technical Details

### OAuth Scopes

- `https://www.googleapis.com/auth/gmail.readonly`: Read-only access to Gmail messages
- `openid email profile`: Standard OpenID Connect scopes for user identity

### Token Management

- Access tokens are stored in the `Account` table (Prisma/NextAuth)
- Refresh tokens enable background sync without user present
- `src/lib/gmail-client.ts` handles token refresh automatically

### Message Classification

- Uses existing `reply-parser.ts` classifier (same logic as inbound ApplicationReply)
- Filters for job-related mail: ATS domains, recruiter emails, job keywords
- Classifies as: `colloquio`, `rifiutata`, `risposta`, `ricevuta`, `auto`, `bounce`

### Application Matching

- Attempts to match Gmail messages to existing `Application` records
- Matches by company domain, company name in subject/body
- When matched, "View Application" link appears in inbox

### Database

- New `GmailMessage` model stores synced messages
- Deduplicates by `gmailMessageId` (unique per user)
- Indexed for fast filtering by user, date, read status

## API Endpoints

- `POST /api/gmail/sync`: Trigger manual sync (fetches last 100 messages)
- `GET /api/gmail/status`: Check if user has Gmail connected

## Limitations & Future Enhancements

### Current Limitations

- Only fetches last 100 messages per sync (Gmail API default)
- No push notifications (Gmail API push requires pub/sub setup)
- Manual refresh only (no automatic background cron yet)

### Future Enhancements

- Cron job for automatic sync (every 6-12 hours)
- Gmail push notifications (real-time updates)
- Pagination for older messages
- Bulk mark read/archive operations
- Reply/Forward directly from inbox (opens mailto or Gmail web)

## Troubleshooting

### "Gmail not connected" despite signing in with Google

- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Verify Gmail API is enabled in Google Cloud Console
- Check that redirect URIs match exactly (trailing slash matters)
- User may need to reconnect: sign out and sign in again with Google

### No messages syncing

- Check `/api/gmail/sync` returns success (not "No Gmail access token")
- Verify user has Gmail messages matching the job-related filter
- Check browser console for errors
- Review server logs for Gmail API errors (rate limits, quota exceeded)

### Token refresh errors

- Ensure `access_type: "offline"` is set in OAuth config (already done)
- Ensure `prompt: "consent"` forces consent screen to get refresh token
- If user signed in before these settings, they need to reconnect

## Security Notes

- Gmail access is **read-only** (`gmail.readonly` scope)
- Tokens are encrypted at rest in database
- No emails are ever sent or modified through this integration
- Users can revoke access anytime via [Google Account permissions](https://myaccount.google.com/permissions)

## Deployment Checklist

Before deploying to production:

- [ ] Gmail API enabled in Google Cloud Console
- [ ] OAuth consent screen configured with correct scopes
- [ ] OAuth client created with production redirect URIs
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Vercel
- [ ] Test login with Google + Gmail consent flow
- [ ] Test sync endpoint returns messages
- [ ] Test classifier correctly labels interview invitations
- [ ] Verify application matching works for known companies

## Support

For issues or questions, contact the development team or refer to:
- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [NextAuth.js OAuth Documentation](https://next-auth.js.org/providers/google)
