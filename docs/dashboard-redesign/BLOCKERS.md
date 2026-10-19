# Dashboard Redesign — Environment Setup Blockers

**Date**: 2026-10-19  
**Branch**: `cursor/dashboard-redesign-6395`

---

## Blockers Encountered

### 1. Database Setup

**Issue**: Cannot run local app for testing  
**Cause**: 
- Schema requires PostgreSQL (`provider = "postgresql"` in `prisma/schema.prisma`)
- No Docker available in Cloud Agent VM (`docker: command not found`)
- No local Postgres service (`postgresql: unrecognized service`)
- `psql` client not installed

**Impact**: Cannot:
- Run `npm run dev` to test dashboard locally
- Capture "before" screenshots with real data
- Run authenticated Playwright tests
- Verify data queries produce expected results

**Attempted**:
- ✅ Created comprehensive test seed script (`prisma/seed-dashboard-test.ts`)
- ✅ Created test environment (`.env.local` with all side effects disabled)
- ✅ Installed npm dependencies
- ❌ Could not run migrations (requires Postgres connection)

**Workaround**:
- Implement redesign based on code analysis and current screenshots (from repo)
- Document manual testing instructions for local verification
- Unit tests for metric calculations (don't require DB connection)
- API authorization tests (mock Prisma client)

**Resolution for Future**:
Run locally with Postgres:
```bash
# Option A: Docker Compose (if Docker available)
docker-compose up -d postgres
export DATABASE_URL="postgresql://user:pass@localhost:5432/lavorai_test"
export DIRECT_URL="postgresql://user:pass@localhost:5432/lavorai_test"
npx prisma migrate deploy
npx tsx prisma/seed-dashboard-test.ts
npm run dev

# Option B: Local Postgres (if installed)
createdb lavorai_test
export DATABASE_URL="postgresql://localhost:5432/lavorai_test"
export DIRECT_URL="postgresql://localhost:5432/lavorai_test"
# ... then same as above
```

---

### 2. Playwright MCP (`microsoft/playwright-mcp`)

**Status**: Not available  
**Issue**: MCP server not installed/authenticated in Cloud Agent environment  
**Impact**: Cannot use MCP-based Playwright for:
- Authenticated exploration of dashboard
- Screenshot capture with real user session
- Network inspection for API calls

**Fallback**: Install Playwright as dev dependency
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Limitation**: Still requires running app (blocked by database issue above)

---

### 3. Stagewise (`stagewise-io/stagewise`)

**Status**: Not applicable (browser toolbar/agent)  
**Issue**: Requires local browser with UI, can't run headless in VM without X11/display  
**Impact**: Cannot use Stagewise for visual frontend inspection

**Resolution**: Document tool for manual local testing only

---

### 4. UXAgent (`neuhai/UXAgent`)

**Status**: Not applicable (requires LLM API key + browser)  
**Issue**: 
- Needs OpenAI/Anthropic API key for simulated usability tests
- Needs running browser (blocked by display/database issues)

**Fallback**: Run scripted task walkthroughs with Playwright instead (when DB available)

**Alternative**: Write manual test scripts that simulate user tasks:
```typescript
// scripts/test-dashboard-usability.ts
// Task: Find applications awaiting approval
// Expected: User navigates to attention section
// Metric: Success if found in <30s
```

---

## What CAN Be Done (Without Database)

### ✅ Code Implementation
- Design new dashboard layout components
- Implement server-side metric aggregation API
- Write dashboard UI components
- Create reusable design system components
- Refactor information architecture

### ✅ Documentation
- Complete audit (DONE: `docs/dashboard-redesign/AUDIT.md`)
- Define metrics (DONE: `docs/dashboard-redesign/METRICS.md`)
- Document tool blockers (THIS FILE)
- Write manual testing instructions
- Create implementation plan

### ✅ Static Analysis
- TypeScript type checking (`npx tsc --noEmit`)
- Lint existing code patterns
- Review API route authorization (code audit)
- Review component accessibility (static props)

### ✅ Unit Tests (No DB Required)
- Metric calculation logic (pure functions)
- Lifecycle derivation (`deriveApplicationLifecycle`)
- Match score calculation (`quickMatchScore`)
- Helper utilities (date formatting, count aggregation)

```bash
# Example: Test deliveryCounts calculation
npx tsx src/lib/__tests__/dashboard-metrics.test.ts
```

### ⏳ Integration Tests (Require DB/Browser)
- API route tests (mock Prisma or use test DB)
- Dashboard page render (snapshot tests)
- Playwright task walkthroughs
- Screenshot capture (before/after)

---

## Testing Strategy (Given Constraints)

### Phase 1: Implementation (Current)
1. ✅ Write audit and metrics docs
2. ⏳ Implement new dashboard components
3. ⏳ Implement metrics API endpoint
4. ⏳ Write unit tests (pure functions, no DB)
5. ⏳ TypeScript check (`npx tsc`)
6. ⏳ Commit and push changes

### Phase 2: Local Verification (Manual, Post-PR)
User with local Postgres setup:
1. Pull branch `cursor/dashboard-redesign-6395`
2. Set up Postgres database
3. Run migrations: `npx prisma migrate deploy`
4. Run test seed: `npx tsx prisma/seed-dashboard-test.ts`
5. Start app: `npm run dev`
6. Open `http://localhost:3000/login`
7. Login as `test-dashboard@lavorai.test` (magic link)
8. Navigate to `/dashboard`
9. Verify metrics match expected values (from seed script)
10. Capture screenshots (desktop 1440px, mobile 375px)
11. Run manual usability tasks
12. Report findings

### Phase 3: Automated Testing (CI/CD)
GitHub Actions with Postgres service:
```yaml
services:
  postgres:
    image: postgres:14
    env:
      POSTGRES_DB: lavorai_test
      POSTGRES_PASSWORD: test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
```
Then run Playwright tests in CI

---

## Expected Dashboard State (From Test Seed)

When `prisma/seed-dashboard-test.ts` runs successfully:

**Test User**: `test-dashboard@lavorai.test` (Marco Rossi, Pro tier)

**Top Metrics**:
- Invii confermati: **3**
- Con risposte recruiter: **3** (2 read, 1 unread)
- Inviti a colloquio: **1** (Satispay)
- Offerte dichiarate: **0**

**Attention Items**: **2**
- 1 unread message (Maria Verdi @ Satispay: "Domanda sul portfolio")
- 1 awaiting approval (Prima, remote Product Designer)

**Open Opportunities**: **6**
- Satispay (Milano, Senior Product Designer, 45-65k)
- Bending Spoons (Milano, Product Designer, 50-75k)
- Credimi (Milano, UX/UI Designer, 35-50k, remote)
- Docebo (Milano, Senior UX Designer, 48-68k, remote)
- Prima (Remoto, Product Designer, 40-58k)
- Tlon (Roma, Lead Product Designer, 50-70k)

**Application Stages**:
- Awaiting approval: **1** (Prima)
- Preparing: **1** (Tlon, optimizing CV)
- In flight: **0**
- Sent (confirmed): **3** (Satispay, Bending Spoons, Credimi)
- Unverified: **1** (Docebo, no receipt)
- Stopped: **1** (Shopfully, job closed)

**Recruiter Replies**:
1. Satispay → Marco (read): Interview invite
2. Credimi → Marco (read): Rejection
3. Satispay → Marco (UNREAD): Portfolio question

**CV Profile**: Complete (name, title, 3 experiences, 6 skills)

---

## Next Steps

1. ✅ Document blockers (THIS FILE)
2. ⏳ Implement dashboard redesign (working code)
3. ⏳ Write unit tests (no DB)
4. ⏳ Commit and push to branch
5. ⏳ Open draft PR with:
   - Implementation changes
   - Test seed script
   - Manual testing instructions
   - Known limitations (no screenshots due to DB blocker)
6. 🔲 User verifies locally (with Postgres)
7. 🔲 Capture screenshots (before/after)
8. 🔲 Run usability tests
9. 🔲 Update PR with findings
10. 🔲 Mark PR ready for review

---

**Status**: Proceeding with implementation despite blockers. Manual verification required post-PR.

