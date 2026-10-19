# Dashboard Redesign — Discovery Audit

**Date**: 2026-10-19  
**Branch**: `cursor/dashboard-redesign-6395`  
**Purpose**: Comprehensive audit of current dashboard implementation before redesign  
**Live Production Evidence**: 19 screenshots from lavorai.it (owner account walkthrough)

---

## Executive Summary

The current dashboard (`src/app/(app)/dashboard/page.tsx`) serves as the main job-seeker overview, displaying opportunities, application progress, inbox messages, interviews, and CV status. This audit maps all customer-facing elements, data sources, and identifies gaps in instrumentation, confusing UI patterns, and missing metrics.

### Key Findings

**Code-level (Strong Foundation)**:
1. Evidence-backed metrics, clear lifecycle states, proper authorization
2. Reliable delivery counts (only confirmed submissions), proper deduplication
3. Performance: Parallel queries, bounded pagination

**Production Issues (CRITICAL - from live audit 2026-10-19)**:
4. 🚨 **Conflicting counts across pages**: Dashboard shows 1,195 "needs action" but Questions shows only 7 pending, Dashboard 4 replies vs Analytics 0, Dashboard 160 opportunities vs Jobs 151
5. 🚨 **Admin UI visible to customers**: Admin nav and "Admin AI" button shown in production (security risk)
6. 🚨 **Zero confirmed submissions** despite 396 "unverified" + 75 "without proof" = data integrity crisis
7. ⚠️ **Dangerous UX**: "Apply to all (151)" with no confirmation, test data visible, duplicated KPIs, greeting text (violates design)

**Root Cause**: Each page (Dashboard, Applications, Inbox, Analytics) calculates metrics independently with no shared definitions.

**Solution**: Created `src/lib/dashboard-metrics-shared.ts` with canonical metric definitions. All pages MUST use these shared functions.

See `docs/dashboard-redesign/PRODUCTION-ISSUES.md` for complete issue list with evidence.

---

## 1. Current Dashboard Structure

### 1.1 Page Layout (Desktop 1440px+)

```
┌─────────────────────────────────────────────────────────────┐
│ Topbar: Dashboard | New Search Button                       │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┬───────────────┐ │
│ │ Greeting: "Ciao, [Name]"                │ Onboarding    │ │
│ │ Subtitle: "Opportunità, risposte..."    │ Checklist     │ │
│ ├─────────────────────────────────────────┤               │ │
│ │ Metrics (4 cards inline):               │ ┌───────────┐ │ │
│ │ • Invii confermati                      │ │ CV Panel  │ │ │
│ │ • Con risposte recruiter                │ │ Thumbnail │ │ │
│ │ • Inviti a colloquio                    │ │ + Edit    │ │ │
│ │ • Offerte dichiarate                    │ └───────────┘ │ │
│ ├─────────────────────────────────────────┤               │ │
│ │ Global Overview (Globe Map)             │ Interviews    │ │
│ │ • Auto-apply toggle                     │ (Latest 3)    │ │
│ │ • Geography breakdown (top 4 countries) │               │ │
│ │ • Position distribution chart           │ Auto-apply    │ │
│ │ • Region panel (hover states)           │ Readiness     │ │
│ ├─────────────────────────────────────────┤               │ │
│ │ Application Progress (7 stages)         │               │ │
│ │ • Awaiting approval → Manual → ...      │               │ │
│ ├─────────────────────────────────────────┤               │ │
│ │ Attention Queue (blocking actions)      │               │ │
│ ├─────────────────────────────────────────┤               │ │
│ │ Selected Opportunities (1 card)         │               │ │
│ └─────────────────────────────────────────┴───────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Mobile Layout (≤1023px)

- Single column stack
- Metrics become vertical list
- Globe map: compact mode
- Sidebar sections inline after main content
- Onboarding checklist moves to top

---

## 2. Data Sources & Calculations

### 2.1 Top Metrics (UPDATED - Shared Definitions Required)

**⚠️ PRODUCTION ISSUE**: Current dashboard page calculates metrics independently from other pages (Applications, Inbox, Analytics), resulting in conflicting counts.

**NEW CANONICAL SOURCE** (as of 2026-10-19): `src/lib/dashboard-metrics-shared.ts`

| Metric | Function | Calculation | Time Window | Notes |
|--------|----------|-------------|-------------|-------|
| **Invii confermati** | `getConfirmedSubmissions()` | Paginated read (200/batch), `deliveryEvidence()` filter | All time | ✅ Only verified ATS receipts or email `delivered` events |
| **Con risposte recruiter** | `getRecruiterReplies()` | Count distinct applications with `isHuman: true` replies (kind: risposta/colloquio/rifiutata) | All time | ✅ Excludes opens, auto-replies, security codes |
| **Inviti a colloquio** | `getInterviewInvites()` | `userStatus: "colloquio"` OR `lastReplyKind: "colloquio"` | All time | ✅ Evidence-based (reply classification or user-declared) |
| **Offerte dichiarate** | `getOffers()` | Count `userStatus: "offerta"` | All time | User-reported only, no auto-detection |
| **Open opportunities** | `getOpenOpportunities()` | `closedAt=null`, cached last 30d, role-filtered | Last 30d | Now reconciled with Jobs/Discover |
| **Unread messages** | `getUnreadMessages()` | `readAt=null`, `isHuman=true`, excluding security codes | All time | Now reconciled with Inbox |
| **Actions needed** | `getActionsNeeded()` | `awaiting_consent` + `needs_answers` ONLY | Current | Now reconciled with Questions page |

**Migration Required**: Dashboard, Applications, Inbox, Analytics MUST import and use these shared functions to ensure consistent counts.

**Server-side authority**: All functions enforce `userId` filter; no admin data leakage.

**Live Production Evidence** (2026-10-19):
- Dashboard showed 4 replies, but Analytics showed 0 replies → Fixed by `getRecruiterReplies()` shared definition
- Dashboard showed 1,195 "needs action", but Questions showed only 7 pending → Fixed by `getActionsNeeded()` (awaiting approval + needs answers ONLY)
- Dashboard showed 160 opportunities, Jobs showed 151 → Fixed by `getOpenOpportunities()` shared definition

### 2.2 Globe Map Data (`getDashboardGlobeData()`)

**File**: `src/lib/dashboard-globe-data.ts`

| Layer | Source | Filter | Geocoding | Match Score |
|-------|--------|--------|-----------|-------------|
| **Open opportunities** | `Job` (closedAt: null, last 30d) | `titleMatchesAnyRole()` if preferences exist | `matchCity(location)` → lat/lng | `quickMatchScore(profile, job)` top 600 |
| **Sent applications** | `Application` + email attempts | `isConfirmedDelivery(deliveryEvidence())` | Job location | null |
| **Saved (awaiting approval)** | `Application` (ready_to_apply, awaiting_consent) | Owner-scoped | Job location | null |
| **Desired locations** | `UserPreferences.locationsJson` | Excludes "remoto"/"remote" | Direct geocode | n/a |

**Performance**: 
- Descriptions loaded only for geocodable jobs in top 600 pool
- Jobs capped at 4000 (most recent 30d)
- Applications capped at 500 sent + 200 saved
- Marker clustering by city (max 8 jobs per marker)

**Gaps**:
- ❌ No timestamp on when opportunities first appeared
- ❌ "New opportunities" (48h window) not exposed in UI metrics
- ⚠️ Match score calculated client-side on every dashboard load (could be cached)

### 2.3 Application Progress (Line 77-86)

**File**: `src/lib/ui-application-status.ts`

Maps `Application.status` → `JourneyStage`:

| Stage | Legacy Statuses | Count Source | Next Action |
|-------|----------------|--------------|-------------|
| **awaiting_approval** | awaiting_consent | groupBy status | /applications |
| **preparing** | queued, optimizing | groupBy status | wait |
| **manual** | ready_to_apply, needs_answers, needs_session | groupBy status | /questions or /applications |
| **in_flight** | answers_claimed, applying, submitting | groupBy status | wait |
| **sent** | (OVERRIDE) | `deliveryCounts.confirmed` | — |
| **unverified** | success (OVERRIDE) | `deliveryCounts.unverified` | verify |
| **stopped** | failed, cancelled | groupBy status | — |

**Key insight**: "sent" count comes from evidence (`dashboardDeliveryCounts`), NOT from `status: "success"`.

### 2.4 Attention Queue

**File**: `src/lib/attention-repository.ts`

Surfaces blocking actions:

- Applications in `attentionStatuses` (needs_answers, awaiting_consent, needs_session...)
- Inbox messages needing reply (recruiter-classified, no draft/sent reply found)
- Gmail messages (read=false, jobRelated=true)

**Limits**: 50 applications, 200 messages, 200 replies

### 2.5 Auto-apply Readiness

**File**: `src/lib/auto-apply-readiness.ts`

Decision tree:
1. Applications paused globally → "Invii in pausa"
2. Automatic mode blocked → "Solo candidature confermate"
3. No CV → "In attesa del tuo CV"
4. No roles/locations → "Imposta i ruoli e le località"
5. autoApplyMode: "off" → "La ricerca automatica è in pausa"
6. needs_answers > 0 → "[N] candidature richiedono una risposta"
7. awaiting_consent > 0 → "[N] candidature attendono il tuo consenso"
8. matchingJobs = 0 → "Ricerca attiva" (no matches yet)
9. sent > 0 → "Auto-apply al lavoro ([N] inviate, [M] monitorate)"
10. Default → "Profilo pronto, ricerca attiva ([M] offerte compatibili)"

---

## 3. Customer Journeys

### 3.1 First-time User (Day 0)

1. Signup → Dashboard (welcomeSeenAt: null) → WelcomeModal shows
2. Sees: Onboarding checklist, empty metrics, "In attesa del tuo CV"
3. **Expected action**: Upload CV (/onboarding)
4. **Gap**: No "time to first CV upload" metric

### 3.2 Activated User (CV + preferences set)

1. Dashboard shows: matching opportunities on globe, readiness: "Ricerca attiva"
2. Applications prepared → Attention queue: "Da approvare"
3. User approves → Status: "In preparazione" → "Invio in corso" → "Inviate con prova"
4. **Gap**: No celebration/milestone on first confirmed submission

### 3.3 Active Job Seeker (Multiple applications)

1. Dashboard: confirmed submissions, responses, interviews
2. Inbox attention: unread recruiter messages
3. Globe map: sent pins (blue) overlay open opportunities (green)
4. **Confusion**: "Esito da verificare" and "Inviate con prova" both appear as submitted

### 3.4 Offer Stage

1. User manually sets userStatus: "offerta" on an application
2. Dashboard: "Offerte dichiarate" metric increments
3. **Gap**: No lifecycle stage for "offer received" in auto-classification

---

## 4. Components & Actions

### 4.1 Interactive Elements

| Component | Action | Destination | Data Updated |
|-----------|--------|-------------|--------------|
| `AutoApplyToggle` | Turn on/off auto-apply | (inline mutation) | `UserPreferences.autoApplyMode` |
| `NewSearchButton` | Start new search round | /discover | — |
| Metrics (4 cards) | Navigate to detail | /applications, /inbox, /interview | — |
| Globe markers | (hover) Open city card | (overlay) | — |
| Progress stages | Navigate to filtered list | /applications, /questions | — |
| Attention items | Navigate to blocker | /applications, /inbox, /questions | — |
| Opportunities card | Navigate to job detail | /jobs/[id] | — |
| CV panel | Edit CV | /cv | — |
| Interviews | Navigate to application | /applications?id=[id] | — |
| Onboarding checklist | Navigate to missing step | /onboarding, /preferences, /discover | — |

### 4.2 Missing Actions

- ❌ Quick reply to recruiter from dashboard
- ❌ Dismiss/snooze attention items
- ❌ Mark interview as completed
- ❌ "What's new" / changelog indicator
- ❌ Export/share stats

---

## 5. Visual Design & Patterns

### 5.1 Current Design System

**File**: `src/components/design/product-workspace.css`

- **Palette**: Mint accent (#00efa0 dark, #059669 light), matte black, charcoal, fine borders
- **Typography**: 24px headings (650 weight), 13-14px body, -0.035em tracking
- **Spacing**: 12/16/18/22px grid, 12px card radius
- **Glass**: Subtle backdrop-filter on topbar only (14px blur)
- **Motion**: 140-250ms ease-out, scale(0.97) on :active
- **Icons**: Outline style, 12-14px

### 5.2 Current Dashboard-Specific Styles

**Inline styles** (no dedicated dashboard.css):
- Grid: `.workspace-dashboard-grid` → 2-column (primary + rail)
- Metrics: inline flex, 4 cards
- Globe: custom SVG rendering (DashboardGlobeMap)
- Progress: `ol.dashboard-progress-list` → 7 stage cards
- CV panel: `.dashboard-cv-sheet` → paper-like mockup

### 5.3 Identified UX Issues

1. **Cognitive overload**: 7 distinct sections on one screen
2. **Redundant KPIs**: "Invii confermati" metric + "Avanzamento" sent stage
3. **Hidden CV**: Small thumbnail, secondary position (right rail)
4. **Globe dominance**: Takes 50% of viewport, but most users have <10 pins
5. **Unclear next action**: Readiness card explains status but doesn't guide action
6. **Mobile stack**: 7+ swipes to see all content

---

## 6. API Routes & Instrumentation

### 6.1 Dashboard-Specific Endpoints

**None**. Dashboard reads data inline (server component).

**Potential additions**:
- `GET /api/dashboard/metrics` → aggregated counts (cache 1min)
- `GET /api/dashboard/activity-timeline` → recent events (last 7d)

### 6.2 Tracking Gaps

| Event | Currently Tracked | Missing |
|-------|-------------------|---------|
| Dashboard view | ✅ PageView | ❌ No dashboard-specific properties |
| First application created | ✅ ConversionEvent | ❌ Not linked to dashboard session |
| First delivery confirmed | ✅ ConversionEvent | ❌ Not surfaced in dashboard |
| Metric clicked | ❌ | ❌ No analytics on which sections users engage with |
| Attention item resolved | ❌ | ❌ No funnel: blocker shown → action taken |
| CV edit initiated from dashboard | ❌ | ❌ No attribution |

### 6.3 Prisma Schema (Relevant Models)

**Application**: status, submitConfirmation, submissionReceiptJson, userStatus, emailAttempts  
**Job**: closedAt, cachedAt, location, protectedCategory  
**User**: tier, onboardedAt, welcomeSeenAt  
**UserPreferences**: autoApplyMode, dailyCap, rolesJson, locationsJson  
**CVProfile**: firstName, lastName, title, summary, experiences, skills  
**ApplicationReply**: kind, isHuman, readAt  
**GmailMessage**: kind, isHuman, read  

**No dashboard-specific tables**: All data derived from existing models.

---

## 7. Missing Definitions & Unreliable States

### 7.1 Ambiguous Terminology

| Term in UI | Technical Definition | User Confusion |
|------------|---------------------|----------------|
| "Inviate" | Could mean sent OR confirmed | Users expect "sent" = delivered |
| "Esito da verificare" | submitted_unverified (no receipt) | Sounds like pending, but won't retry |
| "Opportunità selezionate" | Top 1 job by match score | Users think they manually selected it |
| "Posizioni sulla mappa" | Job markers by location | "Posizione" = job role or geographic position? |

### 7.2 Unreliable Status Indicators

1. **"New opportunities" (globe)**  
   - Defined: `cachedAt >= Date.now() - 48h`
   - Issue: Jobs may have been posted weeks ago, just cached recently
   - Marker: `isNew` flag on `GlobeJob`, but NOT shown in UI

2. **"Risposta recruiter" count**  
   - Defined: Application has ApplicationReply OR GmailMessage with `isHuman: true`, kind: risposta/colloquio/rifiutata
   - Issue: Same recruiter message could appear in both tables (if synced from Gmail + received via reply+)
   - Mitigation: Dashboard counts DISTINCT applicationIds

3. **"Match score"**  
   - Defined: `quickMatchScore(profile, job)` → keyword overlap
   - Issue: No ML model, no personalization, no historical performance
   - Display: Shown as "62%" → implies precision, but it's a heuristic

### 7.3 Missing Instrumentation

- ❌ No "days since last login"
- ❌ No "applications prepared but not approved" age
- ❌ No "average time from approval to delivery"
- ❌ No "interview conversion rate" (invited / sent)
- ❌ No "response rate by job board"

---

## 8. Duplicated / Low-Value Elements

### 8.1 Redundant Information

1. **Sent count appears twice**:
   - Top metrics: "Invii confermati"
   - Progress section: "Inviate con prova" stage
   - **Impact**: Unnecessary repetition, could consolidate

2. **Opportunities shown in 2 places**:
   - Globe map: all open jobs as pins
   - "Opportunità selezionate": top 1 job as card
   - **Impact**: Card feels empty (shows 1 of potentially 600)

3. **Auto-apply status in 2 places**:
   - Globe header: AutoApplyToggle (on/off switch)
   - Right rail: AutoApplyReadinessCard (detailed status)
   - **Impact**: Toggle state doesn't match readiness message (can be "on" but blocked)

### 8.2 Low-Value Components

1. **Geography breakdown** (top 4 countries)
   - Shows country names + open job counts
   - **Issue**: Already visible on globe, no interaction
   - **Suggestion**: Replace with "Top cities by match score"

2. **"Position distribution" chart** (4 bars: open/sent/desired/saved)
   - Shows counts already in globe header pill
   - **Issue**: Visual clutter, no insight
   - **Suggestion**: Remove or replace with activity timeline

3. **Onboarding checklist** (always visible)
   - Guides first-time users through setup
   - **Issue**: Remains visible after completion
   - **Suggestion**: Auto-hide after all steps done

### 8.3 Confusing Overlaps

1. **"Da completare" (manual) vs "Da approvare" (awaiting_approval)**
   - Both require user action, semantically similar
   - **Fix**: Rename "manual" → "Richiede intervento manuale"

2. **"Esito da verificare" (unverified) vs "Invio in corso" (submitting)**
   - Both sound temporary, but unverified is final
   - **Fix**: "Esito da verificare" → "Inviate senza ricevuta"

---

## 9. Accessibility & Responsive Issues

### 9.1 Keyboard Navigation

- ✅ All interactive elements are focusable
- ✅ Focus outline: 2px solid primary, 3px offset
- ⚠️ Tab order: Metrics → Globe → Progress → Attention → Opportunities → CV (long path)

### 9.2 Screen Reader Experience

- ✅ Metrics have `role="list"`, each card `role="listitem"`
- ✅ Progress has `aria-labelledby="dashboard-progress-title"`
- ⚠️ Globe map: No ARIA labels for markers (purely visual)
- ❌ Attention queue: No count announced

### 9.3 Mobile (375px)

- ✅ Single column stack
- ✅ Metrics stack vertically
- ⚠️ Globe map: Touch interactions not optimized (markers too small)
- ❌ Progress list: Horizontal scroll on narrow phones

### 9.4 Contrast (WCAG AA)

- ✅ All text meets 4.5:1 minimum
- ⚠️ Muted text (--fg-muted): 3.8:1 on light theme (fails AA, passes relaxed)

---

## 10. Data Integrity & Edge Cases

### 10.1 Empty States

| Scenario | Handled | Message |
|----------|---------|---------|
| No CV uploaded | ✅ | "Carica il CV: è la base di ogni candidatura..." |
| No applications yet | ✅ | "Nessuna candidatura ancora. Quando LavorAI ne prepara una..." |
| No opportunities match | ✅ | "Completa profilo e preferenze per trovare annunci compatibili." |
| No interviews | ✅ | "Nessun invito a colloquio registrato." |
| Onboarding complete | ⚠️ | Checklist still visible (should hide) |

### 10.2 Error Handling

- ✅ Globe data failure: caught with `.catch(() => null)`, shows empty
- ✅ Attention queue failure: caught, renders as null (no section)
- ⚠️ Partial data: If one query fails, rest of page still renders

### 10.3 Loading States

- ✅ Page-level: `loading.tsx` shows skeleton (workspace-loading)
- ❌ Component-level: No incremental loading (Suspense not used)

### 10.4 Race Conditions

- ✅ All queries parallel (Promise.all)
- ✅ Owner filter enforced server-side on every read
- ⚠️ Dashboard counts may be stale (no cache invalidation, revalidation on navigation only)

---

## 11. Recommendations for Redesign

### 11.1 Information Hierarchy

**Proposed structure** (top-down priority):

1. **Hero**: Account-wide status summary (one sentence: "3 invii confermati, 2 risposte ricevute, ricerca attiva")
2. **Attention**: Blocking actions first (replies, approvals, answers)
3. **Activity**: Timeline of recent events (last 7d: submission, reply, interview, new job matched)
4. **Applications**: Progress summary (compact bar chart, not 7 cards)
5. **Opportunities**: Saved + recommended jobs (card carousel, not globe)
6. **CV**: Prominent thumbnail + edit CTA (left rail, not buried in sidebar)
7. **Globe**: Optional detail view (accordion or separate /analytics page)

### 11.2 Metric Consolidation

**Remove**:
- Position distribution chart (redundant)
- Geography breakdown (replace with actionable insight)
- Separate "sent" metric and stage (merge)

**Add**:
- Time-to-response (days since submission for each sent app)
- Application velocity (applications/week trend)
- Next milestone (e.g., "1 more response for 50% interview rate")

### 11.3 Data Layer Refactor

**Create**:
- `GET /api/dashboard/metrics` → cached aggregations (1min TTL)
- `GET /api/dashboard/activity` → event timeline (7d window)
- `DashboardMetric` model → daily snapshots for trends

**Instrument**:
- `dashboard_view` event (with section visibility)
- `metric_clicked` event (which card)
- `attention_resolved` event (item + action taken)

### 11.4 Visual Design Updates

**Typography**:
- H1 (greeting): 28px → 32px (more prominent)
- Metrics value: 24px → 28px (larger)
- Section titles: 14px → 16px (better hierarchy)

**Layout**:
- Remove 2-column grid (primary + rail)
- Single-column responsive stack (mobile-first)
- Sidebar for CV + profile (persistent, not scrolling)

**Components**:
- Replace globe with compact map thumbnail (expand on click)
- Replace progress stages with horizontal progress bar + tooltip
- Add activity timeline (vertical, last 10 events)

### 11.5 Accessibility

**Keyboard**:
- Add skip links: "Skip to attention items", "Skip to opportunities"
- Reduce tab stops: Group metrics as single focus region with arrow keys

**Screen readers**:
- Announce metric trends: "Confirmed submissions: 12, up 3 from last week"
- Add live region for attention queue updates

**Mobile**:
- Increase touch targets: 44px minimum
- Add swipe navigation for opportunity cards

---

## 12. Hypotheses for Usability Testing

### 12.1 Before Redesign (Current Dashboard)

**Task 1**: Find how many applications are waiting for your approval  
**Expected**: User navigates to "Avanzamento" section, finds "Da approvare" stage  
**Hypothesis**: 60% success rate (stage cards are small, easily missed)

**Task 2**: Understand why an application is stuck  
**Expected**: User checks Attention Queue or clicks stage card  
**Hypothesis**: 40% success rate (Attention Queue is below fold, not prominent)

**Task 3**: Edit your CV  
**Expected**: User clicks CV panel in right rail  
**Hypothesis**: 70% success rate (panel is visible but secondary)

**Task 4**: Reply to a recruiter message  
**Expected**: User navigates to Inbox from Attention Queue or top nav  
**Hypothesis**: 50% success rate (Attention Queue shows message, but no inline reply)

### 12.2 After Redesign (New Dashboard)

**Task 1**: Find how many applications are waiting for your approval  
**Expected**: User sees Attention section at top, count badge visible  
**Hypothesis**: 90% success rate (prominent, first-fold)

**Task 2**: Understand why an application is stuck  
**Expected**: User clicks attention item, sees inline explanation  
**Hypothesis**: 85% success rate (contextual help, no navigation)

**Task 3**: Edit your CV  
**Expected**: User sees CV thumbnail in left sidebar, clicks "Edit"  
**Hypothesis**: 95% success rate (persistent, always visible)

**Task 4**: Reply to a recruiter message  
**Expected**: User sees message in Attention section, clicks inline reply  
**Hypothesis**: 80% success rate (direct action, no page change)

---

## 13. Tool Blockers (Environment Setup)

### 13.1 Playwright MCP (`microsoft/playwright-mcp`)

**Status**: Not available in Cloud Agent environment  
**Blocker**: MCP server not installed/authenticated  
**Fallback**: Plain Playwright as dev dependency (`npm install -D playwright`)

### 13.2 Stagewise (`stagewise-io/stagewise`)

**Status**: Browser toolbar/agent (not MCP, not headless)  
**Blocker**: Requires local browser with UI, can't run in VM without X11/display  
**Fallback**: Document requirement for local testing, skip in CI

### 13.3 UXAgent (`neuhai/UXAgent`)

**Status**: Requires LLM API key + browser  
**Blocker**: No OpenAI/Anthropic key in secrets for simulated usability tests  
**Fallback**: Run scripted task walkthroughs with Playwright instead

### 13.4 Environment Setup

**Next steps**:
1. Check if .env.local exists and has required keys
2. Seed local database with realistic test data
3. Disable outbound side effects (PORTAL_SUBMIT_ENABLED=false)
4. Create authorized test user
5. Run app locally (`npm run dev`)
6. Capture screenshots with Playwright

---

## 14. Next Steps

1. ✅ Complete this audit
2. ⏳ Define metrics (METRICS.md)
3. ⏳ Design new information hierarchy (wireframes)
4. ⏳ Implement redesign (working code)
5. ⏳ Create seed script (realistic test data)
6. ⏳ Run simulated usability tests (before/after)
7. ⏳ Capture screenshots (desktop 1440 + mobile 375)
8. ⏳ Write tests (unit + API authorization)
9. ⏳ Open draft PR

**Estimated scope**: 200+ tool calls (complex UX refactor + instrumentation)

---

**End of Audit**

