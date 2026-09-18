# Reactivation Blast Testing Guide

## Setup

1. Add environment variable to Vercel:
   ```
   REACTIVATION_BLAST_SECRET=<generate-secure-random-value>
   ```
   Or rely on existing `CRON_SECRET` as fallback.

## Testing Dry Run

First, test with dry run to see segment counts and sample emails:

```bash
curl -X POST https://lavorai.it/api/admin/reactivation-blast \
  -H "Authorization: Bearer $REACTIVATION_BLAST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

Expected response:
```json
{
  "ok": true,
  "dryRun": true,
  "sent": {
    "A": { "count": 150, "sent": 0, "failed": 0, "errors": [] },
    "B": { "count": 300, "sent": 0, "failed": 0, "errors": [] },
    "C": { "count": 50, "sent": 0, "failed": 0, "errors": [] }
  },
  "samples": {
    "A": {
      "to": "user@example.com",
      "subject": "Manca un solo passo per far partire LavorAI",
      "preview": "..."
    },
    "B": { ... },
    "C": { ... }
  }
}
```

## Live Send

Once satisfied with dry run results, send actual emails:

```bash
curl -X POST https://lavorai.it/api/admin/reactivation-blast \
  -H "Authorization: Bearer $REACTIVATION_BLAST_SECRET" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "ok": true,
  "dryRun": false,
  "sent": {
    "A": { "count": 150, "sent": 148, "failed": 2, "errors": ["..."] },
    "B": { "count": 300, "sent": 295, "failed": 5, "errors": ["..."] },
    "C": { "count": 50, "sent": 50, "failed": 0, "errors": [] }
  }
}
```

## Segment Definitions

### Segment A: No CV
- **Subject**: "Manca un solo passo per far partire LavorAI"
- **Target**: Users with no `CVDocument` records
- **CTA**: Upload CV at `/onboarding`
- **Goal**: Convert signups to active users

### Segment B: Has CV, No Success
- **Subject**: "Abbiamo sistemato l'invio reale delle candidature"
- **Target**: Users with CV but 0 applications with `status='success'`
- **CTA**: Check preferences at `/preferences`
- **Goal**: Re-engage users who may have experienced issues

### Segment C: Has Success
- **Subject**: "Un favore (e 1 mese Pro se porti un amico)"
- **Target**: Users with ≥1 application with `status='success'`
- **CTA**: Reply to email for referral link
- **Goal**: Generate referrals from satisfied users

## Safety Features

1. **Only targets free, non-suspended users** with verified emails
2. **Excludes test accounts** via `isTestAccount()`
3. **Respects email quota** via `sendWithinQuota()`
4. **Rate limiting**: 100ms delay between sends
5. **Logged** to `EmailLog` with `kind='reactivation_blast'`

## Monitoring

Check `EmailLog` table for sent emails:
```sql
SELECT kind, COUNT(*) 
FROM EmailLog 
WHERE kind = 'reactivation_blast' 
  AND createdAt > NOW() - INTERVAL '1 day'
GROUP BY kind;
```

## Notes

- The endpoint uses existing `RESEND_API_KEY` and `EMAIL_FROM` env vars
- Emails use the same branded template as other transactional emails
- Segment B targets users with CV but either:
  - 0 total applications, OR
  - Applications exist but none with `status='success'`
