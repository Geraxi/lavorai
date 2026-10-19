# Dashboard Metrics — Data Source Definitions

**Branch**: `cursor/dashboard-redesign-6395`  
**Purpose**: Complete documentation of every metric, its data source, calculation, time window, and intended user action

---

## Metric Taxonomy

### Categories
1. **Account Overview**: Cross-application summaries (submissions, responses, outcomes)
2. **Application Progress**: Stage-based breakdown of application lifecycle
3. **Opportunity Discovery**: Job matching and recommendations
4. **Engagement**: Inbox, interviews, attention items
5. **Profile Health**: CV, preferences, readiness

### Guarantees
- **No fabrication**: Every count is derived from database records, never estimated or extrapolated
- **Authorization**: All queries enforce `userId: currentUser.id`, no cross-user leakage
- **Evidence-based**: "Sent" = verified ATS receipt OR email delivery event, never inferred
- **Consistent time windows**: Explicitly documented, never ambiguous ("all time" vs "last 30d")
- **Honest empty states**: "0" is shown as "0", not hidden or replaced with "coming soon"

---

## 1. Account Overview Metrics

### 1.1 Invii Confermati (Confirmed Submissions)

**Label**: 
- IT: "Invii confermati"
- EN: "Confirmed submissions"

**Purpose**: Primary success metric — applications with verified delivery evidence

**Source**: 
- `Application` table (owner-scoped)
- `ApplicationEmailAttempt` (newest per application)
- `submissionReceiptJson` (verified ATS receipts)

**Calculation**:
```typescript
// src/app/(app)/dashboard/page.tsx, line 238-258
async function dashboardDeliveryCounts(userId: string) {
  // Paginated read (200/batch) to avoid memory issues
  for (const application of allApplications) {
    const evidence = deliveryEvidence(application);
    if (isConfirmedDelivery(evidence)) confirmed++;
  }
}
```

**Evidence types counted**:
- `ats_http_receipt`: HTTP 2xx response with `application_id` in body
- `ats_confirmation_page`: DOM evidence (thank-you page, form removed)
- `email_delivered`: Provider `delivered` event with `providerEmailId`

**Excluded**:
- ❌ `status: "success"` without receipt
- ❌ Email `accepted` (provider accepted, not delivered)
- ❌ Tracking pixel opens
- ❌ `submitConfirmation: "UNCONFIRMED"` or `"SUBMISSION_STARTED"`
- ❌ Mock/demo/diagnostic applications (`submittedVia: "mock_demo"`)

**Time window**: All time (user lifetime)

**Next action**: 
- Click → `/applications` (filtered to confirmed)
- No action if 0 (user needs to approve prepared applications)

**Server-side endpoint**: Inline (no API route)

**Proposed enhancement**: 
- Add trend: "+3 this week"
- Add breakdown: "12 confirmed (8 via email, 4 via ATS portal)"

---

### 1.2 Con Risposte Recruiter (With Recruiter Replies)

**Label**:
- IT: "Con risposte recruiter"
- EN: "With recruiter replies"

**Purpose**: Engagement metric — applications that received human responses

**Source**:
- `ApplicationReply` (inbound email via reply+[id]@inbound)
- `GmailMessage` (synced from user's Gmail)

**Calculation**:
```typescript
// src/app/(app)/dashboard/page.tsx, line 53-56
prisma.application.count({
  where: {
    userId: user.id,
    OR: [
      { replies: { some: { 
        isHuman: true, 
        isSecurityCode: false, 
        kind: { in: ["risposta", "colloquio", "rifiutata"] } 
      } } },
      { gmailMessages: { some: { 
        userId: user.id, 
        isHuman: true, 
        kind: { in: ["risposta", "colloquio", "rifiutata"] } 
      } } },
    ]
  }
})
```

**Included**:
- ✅ `isHuman: true` (classified as recruiter, not auto-reply)
- ✅ `kind`: risposta (general), colloquio (interview invite), rifiutata (rejection)
- ✅ Both channels (reply+ inbox and Gmail sync)

**Excluded**:
- ❌ `isSecurityCode: true` (2FA codes misclassified as recruiter replies)
- ❌ `kind: "auto"` (out-of-office, no-reply)
- ❌ `kind: "bounce"` (mailer-daemon)
- ❌ Email opens (tracking pixels)
- ❌ Duplicate replies (same reply in both tables counts once per application)

**Time window**: All time

**Next action**: 
- Click → `/inbox` (filtered to unread/unreplied)
- Hover tooltip: "Applications with recruiter-classified replies. Email opens and automatic receipts excluded."

**Proposed enhancement**:
- Split by kind: "8 responses (3 interviews, 2 rejections, 3 inquiries)"
- Add "unread" badge

---

### 1.3 Inviti a Colloquio (Interview Invites)

**Label**:
- IT: "Inviti a colloquio (ultimi 3)"
- EN: "Interview invites (latest 3)"

**Purpose**: Conversion metric — applications that progressed to interview stage

**Source**:
- `Application.userStatus` (user-declared)
- `Application.lastReplyKind` (auto-classified from reply)

**Calculation**:
```typescript
// src/app/(app)/dashboard/page.tsx, line 58-64
prisma.application.findMany({
  where: {
    userId: user.id,
    OR: [
      { userStatus: "colloquio" },
      { lastReplyKind: "colloquio" }
    ]
  },
  orderBy: { lastReplyAt: "desc" },
  take: 3
})
```

**Evidence**:
- Auto-classification: NLP on recruiter reply body (keywords: "colloquio", "interview", "chiamata", "zoom")
- User-declared: Manual status update on application detail page

**Time window**: Latest 3 (not time-bound)

**Display**:
- Count badge: `interviews.length`
- List: Company, job title, last reply date
- Note: "Dates show the latest reply, not a confirmed appointment."

**Next action**:
- Click → `/applications?id=[id]` (application detail)
- CTA button: "Prepara un colloquio" → `/interview` (practice tool)

**Proposed enhancement**:
- Add interview outcome tracking (`userStatus: "offerta"` after interview)
- Add calendar integration (detect date/time in reply)

---

### 1.4 Offerte Dichiarate (Reported Offers)

**Label**:
- IT: "Offerte dichiarate"
- EN: "Reported offers"

**Purpose**: Terminal success metric — applications that resulted in job offers

**Source**: `Application.userStatus`

**Calculation**:
```typescript
// src/app/(app)/dashboard/page.tsx, line 56
prisma.application.count({
  where: { userId: user.id, userStatus: "offerta" }
})
```

**Classification**: User-declared only (no auto-detection)

**Time window**: All time

**Next action**: 
- Click → `/applications` (filtered to offers)
- No automated workflow (user manually updates status)

**Proposed enhancement**:
- Add offer acceptance tracking (`userStatus: "accettata"` or `"rifiutata"`)
- Add salary negotiation notes field

---

## 2. Application Progress Metrics

### 2.1 Avanzamento Candidature (Application Progress)

**Purpose**: Funnel visualization of application lifecycle stages

**Source**: `Application.status` + `deliveryEvidence()`

**Stages** (line 77-86, dashboard/page.tsx):

| Stage | Legacy Statuses | Count Source | Meaning | Next Action |
|-------|----------------|--------------|---------|-------------|
| **awaiting_approval** | awaiting_consent | groupBy | User approval needed | /applications (approve) |
| **preparing** | queued, optimizing | groupBy | AI generating CV/letter | Wait |
| **manual** | ready_to_apply, needs_answers, needs_session | groupBy | User action required | /questions or /applications |
| **in_flight** | answers_claimed, applying, submitting | groupBy | Delivery in progress | Wait |
| **sent** | (OVERRIDE) | `deliveryCounts.confirmed` | Verified delivery | — |
| **unverified** | success (OVERRIDE) | `deliveryCounts.unverified` | No delivery evidence | Verify on portal |
| **stopped** | failed, cancelled | groupBy | Stopped before sending | — |

**Key insight**: 
- "sent" count uses `deliveryEvidence()`, NOT `status: "success"`
- "unverified" includes `success` rows without receipts

**Calculation**:
```typescript
// src/app/(app)/dashboard/page.tsx, line 74-84
const stageCounts = new Map<JourneyStage, number>();
for (const group of statusGroups) {
  const stage = journeyStage(group.status);
  if (stage && stage !== "unverified" && stage !== "sent") {
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
}
stageCounts.set("sent", deliveryCounts.confirmed);
stageCounts.set("unverified", deliveryCounts.unverified);
```

**Time window**: All time (cumulative)

**Display**: Ordered list, clickable cards with hints

**Next action**: Click stage → filtered application list

**Proposed enhancement**:
- Replace with horizontal progress bar (compact)
- Add age indicator: "3 awaiting approval (oldest: 4d)"
- Add funnel conversion rate: "72% approval → delivery"

---

## 3. Opportunity Discovery Metrics

### 3.1 Panorama Globale (Global Overview)

**Purpose**: Geospatial visualization of jobs and applications

**Source**: `getDashboardGlobeData(userId)` (line 46)

**Sub-metrics**:

#### 3.1.1 Opportunità sulla mappa (Opportunities on the map)

**Count**: `globe.stats.counts.open`

**Calculation** (src/lib/dashboard-globe-data.ts):
```typescript
// Filter by role if preferences exist
const compatible = roles.length 
  ? openJobs.filter(j => titleMatchesAnyRole(j.title, roles)) 
  : openJobs;

// Cap at 600 for performance
const pool = compatible.slice(0, 600);

// Geocode and count
for (const j of pool) {
  const g = geocode(j.location); // matchCity(location) → lat/lng
  if (!g) continue;
  marker(g).counts.open++;
}
```

**Filters**:
- `closedAt: null` (job still open)
- `cachedAt >= 30d ago` (recently synced)
- `dismissals: { none: { userId } }` (not manually dismissed)
- Role match if `UserPreferences.rolesJson` is set

**Time window**: Last 30 days (cache staleness)

**Display**: 
- Globe map: green pins
- Pill: "[N] opportunità sulla mappa"
- Top 4 countries breakdown

**Next action**: Click pin → city card overlay → job detail

**Proposed enhancement**:
- Filter by salary range
- Filter by contract type (employee/P.IVA)
- Show "new" badge for jobs cached in last 48h

#### 3.1.2 Inviate / Desiderate / Salvate (Sent / Desired / Saved)

**Sent**: Blue pins, same as "Invii confermati" metric  
**Desired**: Purple pins, from `UserPreferences.locationsJson`  
**Saved**: Amber pins, applications with `status: ready_to_apply` or `awaiting_consent`

**Display**: Stacked bar chart (4 bars: open/sent/desired/saved)

**Next action**: Visual overview only (no interaction)

**Proposed change**: Remove chart, replace with activity timeline

---

### 3.2 Opportunità Selezionate (Selected Opportunities)

**Purpose**: Top job recommendations

**Source**: `getDashboardGlobeData()` → `recommended` array

**Calculation** (line 89-98, dashboard/page.tsx):
```typescript
// One job per company, sorted by match score
const seen = new Set<string>();
const recommended: GlobeJob[] = [];
for (const marker of globe.markers) {
  for (const job of marker.jobs) {
    if (job.kind !== "open") continue;
    const k = (job.company ?? job.id).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recommended.push(job);
  }
}
recommended.sort((a, b) => (b.match ?? 0) - (a.match ?? 0));
```

**Match score**: `quickMatchScore(profile, job)` → keyword overlap (0-100)

**Display**: Top 1 job card (title, company, location, match %)

**Next action**: Click → `/jobs/[id]`

**Limitation**: Shows only 1 of potentially 600 opportunities

**Proposed enhancement**:
- Show top 3-5 in horizontal carousel
- Add "Why this job?" explanation (matched keywords)
- Add "Save for later" button

---

## 4. Engagement Metrics

### 4.1 Attention Queue

**Purpose**: Surfaces blocking actions that prevent progress

**Source**: `getAttentionQueue(userId, locale)` (line 46)

**Item types**:
1. **Inbox messages** (`ApplicationReply`, `GmailMessage`)
   - Condition: `isHuman: true`, `readAt: null`, no outbound reply found
   - Action: Reply to recruiter

2. **Applications needing answers** (`status: "needs_answers"`)
   - Condition: Form has required fields, user input needed
   - Action: Complete answers in /questions

3. **Applications awaiting consent** (`status: "awaiting_consent"`)
   - Condition: `autoApplyMode: "hybrid"`, user approval required
   - Action: Approve in /applications

4. **Applications needing session** (`status: "needs_session"`)
   - Condition: Portal requires authenticated session
   - Action: Link portal account

**Limits**: 50 applications, 200 messages, 200 replies

**Display**: 
- Count badge: `attention.items.length` (up to 50+)
- List: Title, detail, date
- Unread indicator

**Next action**: Click item → blocker resolution page

**Proposed enhancement**:
- Add "Dismiss" action (snooze for 24h)
- Add priority sorting (interview invites first)
- Add inline quick-reply for messages

---

### 4.2 Auto-apply Readiness

**Purpose**: Explains why applications are/aren't progressing automatically

**Source**: `getAutoApplyReadiness(userId, openJobsPromise)` (line 46)

**Decision tree** (src/lib/auto-apply-readiness.ts):

| Condition | Tone | Title | Next Action |
|-----------|------|-------|-------------|
| Applications paused globally | paused | "Invii in pausa" | /applications |
| Automatic mode blocked | action | "Solo candidature confermate" | /jobs |
| No CV | action | "In attesa del tuo CV" | /onboarding |
| No roles/locations | action | "Imposta i ruoli e le località" | /preferences |
| autoApplyMode: "off" | paused | "La ricerca automatica è in pausa" | /preferences |
| needs_answers > 0 | action | "[N] candidature richiedono una risposta" | /questions |
| awaiting_consent > 0 | action | "[N] candidature attendono il tuo consenso" | /applications |
| matchingJobs = 0 | ready | "Ricerca attiva" | /preferences |
| sent > 0 | ready | "Auto-apply al lavoro" | /applications |
| Default | ready | "Profilo pronto, ricerca attiva" | /jobs |

**Display**: Card with eyebrow, title, detail, CTA button

**Next action**: Click CTA → resolve blocker

**Proposed enhancement**:
- Add progress bar: "Setup 4/5 steps complete"
- Add estimated "Next submission in ~2h" (if pipeline is active)

---

## 5. Profile Health Metrics

### 5.1 CV Status

**Purpose**: Verify user has uploaded and maintained a current CV

**Source**: 
- `CVProfile` (structured CV data)
- `CVDocument` (latest uploaded file)

**Display** (line 196-212, dashboard/page.tsx):
- If no CV: "Carica il CV: è la base di ogni candidatura su misura."
- If CV exists: Thumbnail with name, title, summary, top 3 experiences, top 6 skills
- Footer: Filename + upload date

**Next action**: Click → `/cv` (edit)

**Proposed enhancement**:
- Add "CV last updated: [date]" (separate from upload date)
- Add "CV completeness: 85%" (name, title, summary, 3+ experiences, 5+ skills)
- Add version history dropdown

---

### 5.2 Onboarding Checklist

**Purpose**: Guides first-time users through required setup steps

**Source**: `getOnboardingState(userId)` (line 46)

**Steps** (implementation in OnboardingChecklist component):
1. Upload CV
2. Set job preferences (roles, locations)
3. Review first application
4. Confirm first submission

**Display**: Collapsible card with progress indicator

**Next action**: Click step → resolution page

**Limitation**: Always visible, even after completion

**Proposed enhancement**:
- Auto-hide after all steps complete
- Replace with "What's next?" card for active users

---

## 6. Proposed New Metrics (Not Yet Implemented)

### 6.1 Application Velocity

**Purpose**: Trend of application activity over time

**Calculation**: 
```typescript
// Applications created per week, last 4 weeks
const weeklyCounts = await prisma.application.groupBy({
  by: ["createdAt"],
  where: {
    userId,
    createdAt: { gte: fourWeeksAgo }
  },
  _count: { _all: true }
});
// Aggregate by ISO week
```

**Display**: Sparkline chart (4 data points)

**Label**: "3 applications/week (↑ 12% from last week)"

---

### 6.2 Response Rate

**Purpose**: Percentage of sent applications that received recruiter replies

**Calculation**:
```typescript
const sent = deliveryCounts.confirmed;
const replied = prisma.application.count({
  where: { 
    userId, 
    OR: [
      { replies: { some: { isHuman: true } } },
      { gmailMessages: { some: { isHuman: true } } }
    ]
  }
});
const rate = sent > 0 ? (replied / sent * 100).toFixed(0) : null;
```

**Display**: "24% response rate (8 of 33 sent)"

**Proposed insight**: "Industry average: 18%" (if we have benchmark data)

---

### 6.3 Time to Response

**Purpose**: Average days from submission to first recruiter reply

**Calculation**:
```typescript
const apps = await prisma.application.findMany({
  where: { 
    userId, 
    submittedAt: { not: null },
    OR: [
      { replies: { some: { isHuman: true } } },
      { gmailMessages: { some: { isHuman: true } } }
    ]
  },
  select: {
    submittedAt: true,
    replies: { orderBy: { receivedAt: "asc" }, take: 1 },
    gmailMessages: { orderBy: { date: "asc" }, take: 1 }
  }
});
// Calculate days: reply.date - submittedAt
```

**Display**: "Avg 3.2 days to first response"

---

### 6.4 Interview Conversion Rate

**Purpose**: Percentage of sent applications that resulted in interview invites

**Calculation**:
```typescript
const sent = deliveryCounts.confirmed;
const interviews = await prisma.application.count({
  where: {
    userId,
    OR: [
      { userStatus: "colloquio" },
      { lastReplyKind: "colloquio" }
    ]
  }
});
const rate = sent > 0 ? (interviews / sent * 100).toFixed(0) : null;
```

**Display**: "15% interview rate (5 of 33 sent)"

---

## 7. Server-Side Aggregation API

### Proposed: `GET /api/dashboard/metrics`

**Purpose**: Pre-compute dashboard metrics server-side, cache for 1min

**Response**:
```json
{
  "userId": "clx...",
  "computedAt": "2026-10-19T09:00:00.000Z",
  "overview": {
    "confirmed": 12,
    "providerAccepted": 3,
    "withReplies": 8,
    "interviews": 5,
    "offers": 2
  },
  "progress": {
    "awaiting_approval": 2,
    "preparing": 1,
    "manual": 0,
    "in_flight": 0,
    "sent": 12,
    "unverified": 4,
    "stopped": 3
  },
  "opportunities": {
    "open": 47,
    "compatible": 47,
    "newLast48h": 8
  },
  "attention": {
    "totalItems": 6,
    "unreadMessages": 3,
    "draftReplies": 1
  },
  "trends": {
    "applicationsLast7d": 4,
    "applicationsLast30d": 12,
    "responseRate": 24,
    "avgDaysToResponse": 3.2
  }
}
```

**Cache**: 1 minute (revalidate on mutation)

**Authorization**: Requires authenticated session, returns only requesting user's data

---

## 8. Data Integrity Tests

### Unit Tests (Proposed)

**File**: `src/lib/__tests__/dashboard-metrics.test.ts`

```typescript
describe("dashboardDeliveryCounts", () => {
  it("counts only verified deliveries", async () => {
    // Mock application with verified receipt
    // Assert count = 1
  });

  it("excludes provider-accepted email", async () => {
    // Mock application with acceptedAt, no deliveredAt
    // Assert count = 0
  });

  it("excludes status=success without receipt", async () => {
    // Mock application with status=success, no submissionReceiptJson
    // Assert count = 0
  });

  it("paginates correctly for 1000+ applications", async () => {
    // Mock 1200 applications
    // Assert all are counted, no duplicates
  });
});
```

### API Authorization Tests (Proposed)

**File**: `src/app/api/dashboard/metrics/__tests__/route.test.ts`

```typescript
describe("GET /api/dashboard/metrics", () => {
  it("returns 401 if not authenticated", async () => {
    const res = await fetch("/api/dashboard/metrics");
    expect(res.status).toBe(401);
  });

  it("returns only requesting user's data", async () => {
    // Create two users with applications
    // Authenticate as user A
    const res = await fetch("/api/dashboard/metrics");
    const data = await res.json();
    // Assert data.overview.confirmed = user A's count, not B's
  });

  it("excludes admin/test accounts", async () => {
    // Create admin user with applications
    // Authenticate as admin
    const res = await fetch("/api/dashboard/metrics");
    const data = await res.json();
    // Assert test applications are excluded
  });
});
```

---

## 9. Metric Change Log

### 2026-10-19: Initial Documentation

- ✅ Documented all existing dashboard metrics
- ✅ Defined data sources and calculations
- ✅ Identified unreliable status indicators
- ✅ Proposed new metrics (velocity, response rate, time to response)

### Future Enhancements

- [ ] Implement `GET /api/dashboard/metrics` endpoint
- [ ] Add trend indicators (7d/30d comparison)
- [ ] Add benchmark comparisons (user vs platform average)
- [ ] Add milestone celebrations (first delivery, 10th application, etc.)
- [ ] Add export functionality (CSV, JSON)

---

**End of Metrics Documentation**

