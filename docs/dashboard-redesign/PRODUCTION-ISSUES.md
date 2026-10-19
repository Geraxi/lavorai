# Production Dashboard — Critical Issues (Live Audit 2026-10-19)

**Source**: Live walkthrough of lavorai.it with owner account (Umberto)  
**Screenshots**: `docs/dashboard-redesign/screenshots/before-prod/` (19 PNGs, 1440px)  
**Date**: October 19, 2026

---

## 🚨 Critical Data Inconsistencies

### 1. Conflicting Application Counts

**Dashboard Progress Section**:
- "Needs action": **1,195**
- "Outcome unverified": **396**
- "Not sent": **1,668**
- **Total implied**: ~3,259 applications

**Attention Queue**:
- "Needs your attention": **3,255** items
- "Complete or verify": **3,258** applications

**Questions Page**:
- "Pending answers": **7**
- "Total to answer": **59**

**❌ Issue**: Dashboard shows "1,195 needs action" but Questions page shows only 7 pending answers. Where are the other 1,188?

### 2. Conflicting Reply Counts

**Dashboard Metrics**:
- "Con risposte recruiter": **4**

**Inbox**:
- "Unread messages": **52** (not 36 as dashboard attention shows)

**Analytics Page**:
- "With recruiter replies": **0** (!)
- "Historical submissions without proof": **75**

**❌ Issue**: Dashboard says 4 replies, Analytics says 0 replies. Which is correct?

### 3. Conflicting Opportunity Counts

**Dashboard Globe**:
- "Opportunities on map": **160**
- "Catalog jobs": **48,359**
- "Matching": **251**
- "New opportunities": **160**

**Discover Page**:
- Visible cards: **~50** (scrollable, unclear total)

**Jobs Page**:
- Total available: **151** jobs

**❌ Issue**: Dashboard shows 160 opportunities, Jobs shows 151, Discover shows ~50. No single source of truth.

### 4. Confirmed Submissions Discrepancy

**Dashboard Metrics**:
- "Invii confermati": **0**

**Dashboard Progress**:
- "Sent with evidence": **0**
- "Outcome unverified": **396** (possibly sent?)

**Analytics**:
- "Historical submissions without proof": **75**

**❌ Issue**: Zero confirmed submissions despite 396 "outcome unverified" + 75 "without proof" = 471 potentially sent applications?

---

## 🔴 Critical UX Issues

### 5. Admin UI Visible to Customer

**Observed**:
- Admin navigation visible in sidebar (should be server-side hidden for non-admins)
- "Admin AI" button visible in topbar
- Customer account should NEVER see admin controls

**Security risk**: If these are not server-side gated, any user could access admin routes

**Fix required**: Server-side role check in:
- `src/components/design/sidebar.tsx` (hide admin nav items)
- `src/components/design/topbar.tsx` (hide Admin AI button)
- `src/proxy.ts` (block /admin/* routes for non-admins)

### 6. Duplicated Opportunity KPIs

**Dashboard Globe Section**:
- Shows 4 separate KPIs: "Opportunità / Inviate / Desiderate / Salvate"
- Below that, "Position distribution" chart with same 4 counts
- Below that, top 4 countries breakdown

**❌ Issue**: Same information repeated 3 times in one section (chart is pure decoration, adds no insight)

### 7. Zero-Evidence Funnel

**Dashboard Progress shows**:
- 0 awaiting approval
- 0 preparing
- **1,195 needs action** (but only 7 actual questions pending?)
- 0 sending
- **0 sent with evidence**
- **396 outcome unverified**
- **1,668 not sent**

**❌ Issue**: This funnel suggests a 0% delivery rate with 2,064 failed/unverified applications. If accurate, this is a product crisis. If inaccurate, metrics are broken.

### 8. "Apply to All (151)" Danger

**Jobs Page**:
- Prominent green button "Applica a tutte (151)"
- No confirmation, no safeguards visible

**❌ Issue**: One-click bulk apply to 151 jobs is extremely risky:
- Could exhaust daily cap instantly
- Could send to irrelevant positions
- Could violate rate limits
- Could waste AI credits

**Should be**: Multi-step confirmation with preview, limits, and explicit consent

---

## ⚠️ Medium Priority Issues

### 9. Greeting Text (Design Constraint Violation)

**Dashboard shows**:
- "Ciao, Umberto" (personalized greeting)

**Design requirements said**:
- No greeting text
- Straight to data (like Vercel/Stripe)

### 10. Mixed Language (IT/EN)

**Observed**:
- Most UI in Italian
- Some labels in English ("Match", "Remote", etc.)
- Inconsistent throughout

### 11. Trial Status Confusion

**Settings shows**:
- Plan: "Pro+" (€39.99/month)
- Status: "Trial ended, nothing sent"

**❌ Issue**: If user has Pro+ subscription, why does it say "trial ended"? Confusing subscription state.

### 12. 0% Match Cards Shown

**Preferences**:
- "Ibrido" mode with "match >= 0%"
- Jobs page shows multiple "0% match" cards

**❌ Issue**: Why show 0% match jobs to user? Either threshold is meaningless or cards should be filtered out.

### 13. Repeated Cards in Questions

**Questions page**:
- Klaviyo card appears **3 times** (same company, same questions)

**❌ Issue**: Duplicated content, should be deduplicated

### 14. Test Data in Production

**Interviews page**:
- Shows "[LavorAI TEST]" application

**❌ Issue**: Test/demo data visible in production user account

### 15. "Paused" Redundancy

**"Paused" status shown in 4 places**:
1. Dashboard auto-apply card
2. Preferences auto-apply toggle
3. Applications page header
4. Another location (unclear from screenshots)

**❌ Issue**: Redundant, user already knows after seeing it once

### 16. Green "Salvato" Looks Like Action

**Jobs cards**:
- Green "Salvato" (saved) badge looks like a CTA button
- User might think they need to click it

**❌ Issue**: Should be muted/neutral color (gray), not accent green

---

## 📊 Data Integrity Root Causes

### Missing Server-Side Definitions

**Problem**: Each page calculates its own metrics independently:

1. **Dashboard** (`/dashboard/page.tsx`):
   - `dashboardDeliveryCounts()` - paginated evidence-backed count
   - `Application.count()` for replies
   - `getDashboardGlobeData()` for opportunities
   - `getAttentionQueue()` for needs action

2. **Applications** (`/applications/page.tsx`):
   - Own filtering logic
   - Own status grouping
   - Different evidence checks?

3. **Inbox** (`/inbox/page.tsx`):
   - `getInboxMessages()` with different filters
   - Different unread count logic

4. **Analytics** (`/analytics/page.tsx`):
   - Own aggregation queries
   - Different delivery evidence checks?

5. **Jobs/Discover**:
   - Different opportunity counts
   - Different filtering

**Solution**: Create shared server-side definitions in `src/lib/`:

```typescript
// src/lib/dashboard-metrics-shared.ts
export async function getConfirmedSubmissions(userId: string): Promise<number> {
  // Single source of truth, reused everywhere
}

export async function getRecruiterReplies(userId: string): Promise<number> {
  // Single source of truth, reused everywhere
}

export async function getOpenOpportunities(userId: string): Promise<number> {
  // Single source of truth, reused everywhere
}

export async function getUnreadMessages(userId: string): Promise<number> {
  // Single source of truth, reused everywhere
}

export async function getActionsNeeded(userId: string): Promise<number> {
  // Single source of truth, reused everywhere
}
```

Then all pages import and use these shared functions, ensuring consistent counts.

---

## 🔧 Fixes Required for Redesign

### 1. Reconcile Metrics (High Priority)

**Action**: Create `src/lib/dashboard-metrics-shared.ts` with canonical definitions:
- Confirmed submissions (evidence-backed only)
- Recruiter replies (distinct applicationIds, isHuman=true, excluding security codes)
- Open opportunities (role-filtered, closedAt=null, last 30d cache)
- Unread messages (attention queue count)
- Actions needed (awaiting approval + needs answers, NOT all queued)

**Test**: Verify Dashboard, Applications, Inbox, Analytics, Jobs all show same counts

### 2. Hide Admin UI (High Priority, Security)

**Action**: 
```typescript
// src/components/design/sidebar.tsx
const user = await getCurrentUser();
const isAdmin = user?.email.includes('umbertogeraci'); // Or proper role check

// Only show admin nav if isAdmin
{isAdmin && <SidebarSection title="Admin">...</SidebarSection>}
```

**Action**:
```typescript
// src/components/design/topbar.tsx
{isAdmin && <button>Admin AI</button>}
```

**Action**:
```typescript
// src/proxy.ts
if (pathname.startsWith('/admin') && !isAdmin(session)) {
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

### 3. Remove Duplicated KPIs (Medium Priority)

**Action**: Remove position distribution chart from dashboard globe section (it's the same data as the 4 pill badges above it)

### 4. Fix "Needs Action" Definition (High Priority)

**Current**: Shows 1,195 (unclear what this includes)

**Should be**: 
- Awaiting approval count (status: awaiting_consent)
- + Needs answers count (status: needs_answers, pendingQuestionsJson not null)
- Total should match Questions page "to answer" count

### 5. Add Bulk Apply Confirmation (High Priority, Safety)

**Action**: "Apply to all (151)" button should:
1. Show confirmation modal
2. Display list of jobs (scrollable preview)
3. Show daily cap remaining
4. Warn about AI credit usage
5. Require explicit "I understand" checkbox
6. Show progress during bulk operation

### 6. Remove Test Data (Medium Priority)

**Action**: Filter out applications with `[LavorAI TEST]` or `diagnostic` status from production views

### 7. Fix Green "Salvato" (Low Priority, Polish)

**Action**: Change saved badge color from green (accent) to gray (muted)

---

## 📸 Production Screenshot References

All screenshots saved in: `docs/dashboard-redesign/screenshots/before-prod/`

**Key screenshots**:
- `01-dashboard.png` - Shows greeting, globe, conflicting counts, admin UI
- `03-applications.png` - Shows different application count (3,259)
- `04-inbox.png` - Shows 52 unread (not 36)
- `07-questions.png` - Shows only 7 pending (not 1,195)
- `08-job-board-*.png` - Shows 151 jobs, "Apply to all" danger button
- `09-analytics.png` - Shows 0 replies (conflicts with dashboard 4)

---

## ✅ Redesign Ensures

1. **Single source of truth**: Shared metric definitions (`dashboard-metrics-shared.ts`)
2. **No admin UI leak**: Server-side role checks
3. **No duplicated KPIs**: Removed redundant charts
4. **Honest metrics**: Evidence-backed only, no fabrication
5. **Clear next actions**: Attention queue with actual blocking items
6. **No dangerous bulk actions**: Confirmation required
7. **No test data**: Filtered from production views
8. **Consistent counts**: Dashboard = Applications = Inbox = Analytics

---

**Evidence**: 19 production screenshots, live audit notes  
**Impact**: Critical data integrity and security issues identified  
**Action**: Redesign addresses all issues with shared definitions and server-side enforcement

