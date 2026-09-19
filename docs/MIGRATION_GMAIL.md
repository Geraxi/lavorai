# Database Migration: Gmail Integration

## What Changed

Added `GmailMessage` model to store synced Gmail messages.

## Migration Steps

### Development

```bash
npx prisma db push
npx prisma generate
```

### Production (Vercel/Railway with Postgres)

The build script already includes `prisma db push`, so deploying this PR will automatically apply the schema changes.

**Manual migration alternative:**
```bash
npx prisma migrate dev --name add_gmail_messages
npx prisma migrate deploy
```

## Schema Changes

### New Model: `GmailMessage`

Stores synced Gmail messages with classification and optional link to Application.

**Key fields:**
- `gmailMessageId`: Gmail's permanent message ID (for dedup)
- `fromAddress`, `subject`, `bodyText`: Message content
- `kind`: Classification (colloquio, rifiutata, risposta, etc.)
- `label`: User-facing label for filtering
- `applicationId`: Optional link to matching Application
- `read`, `archived`: UI state

**Indexes:**
- `userId` + `gmailMessageId` (unique constraint for dedup)
- `userId` + `date` (for fast chronological queries)
- `userId` + `read` (for unread filter)
- `applicationId` (for reverse lookup)

### Model Updates

- `User.gmailMessages`: Relation to GmailMessage
- `Application.gmailMessages`: Relation to GmailMessage

## Rollback

If needed, remove the GmailMessage model and relations:

```sql
DROP TABLE "GmailMessage";
-- Remove gmailMessages field from User and Application (no-op, just relation)
```

## Data Migration

No existing data migration required — this is a new feature with empty table on first deploy.

## Testing

After deployment:
1. User signs in with Google (or connects Gmail via OAuth)
2. Navigate to `/inbox`
3. Click "Refresh" to trigger first sync
4. Verify messages appear with correct classifications
5. Check "View Application" link works for matched messages

**Local Development:**
If testing locally, ensure `.env` has these set:
```bash
DATABASE_URL="your_postgres_connection_string"
DIRECT_URL="your_postgres_direct_connection_string"
GOOGLE_CLIENT_ID="your_client_id"
GOOGLE_CLIENT_SECRET="your_client_secret"
```
