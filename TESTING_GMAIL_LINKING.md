# Gmail Account Linking - Testing Guide

> **Note:** This feature uses a standalone OAuth flow that does NOT call NextAuth signIn, preventing logout issues for password/magic-link users.

## Setup Requirements

1. **Environment Variables Required:**
   ```bash
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   AUTH_SECRET=your_auth_secret  # Required for HMAC state signing
   NEXT_PUBLIC_GOOGLE_ENABLED=true
   ```

2. **Google Cloud Console:**
   - OAuth 2.0 Client configured
   - **⚠️ CRITICAL:** Authorized redirect URIs must include:
     - Production: `https://lavorai.it/api/gmail/callback`
     - Dev: `http://localhost:3000/api/gmail/callback`
   - Scopes: openid, email, profile, https://www.googleapis.com/auth/gmail.readonly

3. **Database:**
   - `GmailMessage` table exists (from PR #14)
   - `Account` table with Google provider support

## Test Scenarios

### Scenario 1: Email/Password User Links Gmail (Happy Path)

**Setup:**
- User registered with email `user@example.com` using password

**Steps:**
1. Login with email/password
2. Navigate to `/inbox`
3. Verify "Collega Gmail" button is visible
4. Click "Collega Gmail"
5. Modal opens explaining permissions
6. Click "Autorizza Gmail"
7. Redirected to Google OAuth consent screen
8. Sign in with Google account using **same email** `user@example.com`
9. Grant permissions
10. Redirected back to `/inbox?gmail=linked`

**Expected Results:**
- ✓ User stays logged in as same account
- ✓ Success message: "Gmail collegato con successo! Le risposte dei recruiter appariranno qui."
- ✓ Gmail inbox UI appears with messages (after sync)
- ✓ Database `Account` table has new row with provider='google', access_token present, scope includes 'gmail.readonly'
- ✓ No duplicate user created
- ✓ Can use "Sincronizza" button to fetch new messages

### Scenario 2: Magic Link User Links Gmail

**Setup:**
- User registered with email `user@example.com` using magic link

**Steps:**
1. Login via magic link
2. Navigate to `/inbox`
3. Click "Collega Gmail"
4. Complete OAuth with Google account `user@example.com`

**Expected Results:**
- Same as Scenario 1

### Scenario 3: User Already Has Google Account (Direct to Inbox)

**Setup:**
- User registered directly with Google OAuth

**Steps:**
1. Login with Google
2. Navigate to `/inbox`

**Expected Results:**
- ✓ Gmail inbox UI loads directly (no empty state)
- ✓ `hasGmailConnected()` returns true
- ✓ Messages display after first sync

### Scenario 4: Email Mismatch (Edge Case)

**Setup:**
- User registered with `user@example.com` using password

**Steps:**
1. Login with email/password
2. Navigate to `/inbox`
3. Click "Collega Gmail"
4. Complete OAuth with **different Google account** `different@gmail.com`

**Expected Results:**
- ✓ User remains logged in as `user@example.com` (original account)
- ✓ Error message shown: "L'email Google non corrisponde all'account LavorAI (user@example.com). Usa lo stesso indirizzo email."
- ✓ **No account linking occurs** (email validation enforced in callback)
- ✓ **No new user created** (standalone flow never creates users)
- ✓ Original user's session is **not affected**
- ✓ User can retry with correct email

### Scenario 5: User Not Logged In

**Steps:**
1. Open `/inbox` without being logged in (or in incognito)
2. Redirected to `/login?next=/inbox`
3. Login
4. Redirected back to `/inbox`

**Expected Results:**
- ✓ Standard auth flow works
- ✓ After login, can see "Collega Gmail" button

### Scenario 6: OAuth Cancel/Abort

**Steps:**
1. User clicks "Collega Gmail"
2. Google OAuth screen opens
3. User clicks "Cancel" or closes the window

**Expected Results:**
- ✓ User redirected back to `/inbox` (or stays on Google page)
- ✓ No account linking occurs
- ✓ User remains logged in
- ✓ "Collega Gmail" button still visible

## Database Verification

After successful linking, verify in Prisma Studio or direct DB query:

```sql
SELECT * FROM "Account" 
WHERE "userId" = '<user_id>' AND "provider" = 'google';
```

Expected fields:
- `access_token`: present (JWT string)
- `refresh_token`: present (for offline access)
- `scope`: contains "gmail.readonly"
- `expires_at`: Unix timestamp

## Security Checks

1. **Session Preservation:**
   - User ID in session before OAuth = User ID after OAuth (same user)

2. **No Forced Logout:**
   - User should never be logged out during the flow
   - Session cookie persists throughout

3. **Email Match Enforcement:**
   - Linking only occurs when Google email === account email
   - Different email creates new user (doesn't hijack existing session)

4. **CSRF Protection:**
   - NextAuth handles CSRF tokens automatically
   - `/api/gmail/connect` verifies active session before redirect

## Rollback Plan

If issues occur in production:

1. **Disable Google OAuth entirely:**
   ```bash
   # Remove env vars
   unset GOOGLE_CLIENT_ID
   unset GOOGLE_CLIENT_SECRET
   unset NEXT_PUBLIC_GOOGLE_ENABLED
   ```
   - Google provider won't register
   - "Collega Gmail" button won't show (guarded by `NEXT_PUBLIC_GOOGLE_ENABLED`)

2. **Revert commits:**
   ```bash
   git revert <commit-hash>
   ```

## Implementation Details

### Standalone OAuth Flow

This implementation uses a **standalone Google OAuth flow** separate from NextAuth to prevent session replacement:

1. **`/api/gmail/connect`**:
   - Generates HMAC-signed state token with `{ userId, nonce, exp }`
   - Redirects to Google OAuth (NOT to NextAuth)
   - State signature prevents CSRF attacks

2. **`/api/gmail/callback`**:
   - Verifies state signature using `AUTH_SECRET`
   - Exchanges code for tokens directly with Google
   - Validates email match (normalized comparison)
   - Checks for account conflicts (another user owns this Google account)
   - Upserts `Account` table record
   - Redirects with success/error query params

3. **Session Preservation**:
   - Never calls NextAuth `signIn()` or `signOut()`
   - Session cookies remain unchanged
   - User ID stays the same throughout flow

### Error Handling

All error cases redirect to `/inbox?gmail=error&reason=<code>` with Italian error messages:
- `denied`: User canceled OAuth
- `email_mismatch`: Google email ≠ LavorAI email
- `account_already_linked`: Google account owned by different user
- `state_expired`: State token older than 10 minutes
- `invalid_state`: CSRF/tampering detected
- `token_exchange`: Failed to get tokens from Google
- `server_config`: Missing env vars
- `db_error`: Database operation failed

## Known Limitations

1. **Token Refresh Implemented:**
   - Access tokens expire (typically 1 hour)
   - Refresh logic exists in `getGmailAccessToken()` in `gmail-client.ts`
   - Automatically refreshes using `refresh_token`

2. **No Disconnect UI:**
   - User can link Gmail but no UI to unlink
   - TODO: Add "Scollega Gmail" in Settings
   - Manual disconnect: delete `Account` row with `provider='google'`

3. **No Email Change Handling:**
   - If user changes primary email on Google account, link may break
   - TODO: Add re-link flow

## Support Resources

- NextAuth v5 Account Linking: https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking
- Google OAuth Scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Gmail API: https://developers.google.com/gmail/api
