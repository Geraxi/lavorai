# Gmail Account Linking - Testing Guide

## Setup Requirements

1. **Environment Variables Required:**
   ```bash
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   NEXT_PUBLIC_GOOGLE_ENABLED=true
   ```

2. **Google Cloud Console:**
   - OAuth 2.0 Client configured
   - Authorized redirect URIs must include: `https://your-domain.com/api/auth/callback/google`
   - Scopes: openid, email, profile, https://www.googleapis.com/auth/gmail.readonly

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
- ✓ "Collega Gmail" button no longer visible
- ✓ Database `Account` table has new row with provider='google', access_token present, scope includes 'gmail.readonly'
- ✓ No duplicate user created

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

### Scenario 3: User Already Has Google Account (No Button Shown)

**Setup:**
- User registered directly with Google OAuth

**Steps:**
1. Login with Google
2. Navigate to `/inbox`

**Expected Results:**
- ✓ "Collega Gmail" button is **not visible**
- ✓ `hasGmailConnected()` returns true

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
- ✓ NextAuth creates a **new separate user** with email `different@gmail.com`
- ✓ No linking occurs (allowDangerousEmailAccountLinking only links when emails match)
- ✓ Original user's session is **not affected**
- ⚠️ Modal warns: "L'account Gmail che colleghi deve avere la stessa email del tuo account LavorAI"

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

## Known Limitations

1. **Token Refresh Not Implemented:**
   - Access tokens expire (typically 1 hour)
   - Current implementation stores token but doesn't auto-refresh
   - TODO: Implement refresh logic in `getGmailAccessToken()`

2. **No Disconnect UI:**
   - User can link Gmail but no UI to unlink
   - TODO: Add "Scollega Gmail" in Settings

3. **No Email Change Handling:**
   - If user changes primary email on Google account, link may break
   - TODO: Add re-link flow

## Support Resources

- NextAuth v5 Account Linking: https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking
- Google OAuth Scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Gmail API: https://developers.google.com/gmail/api
