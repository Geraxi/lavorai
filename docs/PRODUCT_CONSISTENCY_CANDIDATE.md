# LavorAI product consistency candidate

Status: local, unpublished. Branch `fix/product-consistency` in `/Users/umbertogeraci/Documents/Codex/2026-10-15/task-9/lavorai-consistency`.

The candidate restores the prior brand palette, consolidates signed-in navigation and presentation, and repairs interrupted or misleading flows. It retains the existing sidebar and the useful structure of the pending visual, pagination, feedback and Inbox work. No production migrations, pushes, deployments, customer sign-ins, provider sends or artifact uploads were performed.

## Integration and provenance

Canonical live base: `977c766f0f99ae57944b99ac3adee34be66cb6e8` (Google sign-in verification/account identity fix).

| Pending source | Source commit | Integrated local commit |
| --- | --- | --- |
| Main workspace visual/layout correction | `005c0a57d058af07b17c4459f9b1389e002a9695` | `e7631ad` |
| Applications pagination | `c4e964ebebd27a2dd5a0fcd857ffece657611156` | `c475335` |
| Private feedback and protected admin triage | `1a2ca8819d79cfeae155938770c7489f06c04267` | `9806e6b` |
| Inbox conversations and deliberate replies | `efd7ef47ec9006414f7963b0f15176c5a207bf22` | `105494b` |

The three source checkouts were read only. Their work was cherry-picked into an independent clone. Package test scripts retain Google-auth, pagination, feedback and Inbox coverage. Both schema additions coexist. `git diff 977c766 -- src/lib/auth.ts src/lib/auth-adapter.ts src/lib/google-auth.ts src/app/login/page.tsx src/lib/billing.ts` is empty: the live auth fix and central billing rules are preserved.

## Exact historical palette

Historical source: `829c950c606f8b005ea5d6051bba9d2ffd094cbf`, before the user-screen redesign. Inspect with `git show <commit>:<path>`.

| Source at that commit | Historical values | Final application |
| --- | --- | --- |
| `src/app/globals.css` | Dark canvas `#010510`; raised/surface `rgba(255,255,255,0.03)`; sunken `rgba(0,0,0,0.3)`; foreground `#FFFFFF`; muted white 70%; borders white 10%/20% | Shared signed-in canvas, panels, text and borders; removed six-route slate overrides |
| `src/app/globals.css` light theme | Canvas `#EEF5F0`; surface `#DDEDE2`; sidebar `#17493A`; ink `#0F1012`; icon `oklch(0.52 0.17 155)`; primary `155 50% 34%` | Restored light-green family across the workspace |
| `src/components/landing/landing-homepage.module.css` (approved landing history `2471ee4`) | Mint `#00efa0`; ink `hsl(201 100% 13%)`; deep `#022536`; muted `#b4bec6` | Exact existing mint reused for signed-in actions, selected states and navigation; landing left intact |
| `src/components/auth/auth.css` (approved auth history `3d73d4a`) | Deep teal `#002c2e`; mint `#8aebce`; foreground `#f6fbfa`; muted `#cadad9`; panel `#003537` → `#002729` | Login/signup palette retained; forgot/reset/verify now reuse the same AuthShell |
| `src/components/logo.tsx` | Emerald `#34D399` | Existing logo retained, reused on billing entry screens |

This is a deliberate composition of existing approved colors, not a claim that all final tokens equal the old app. The old dark app primary was `155 50% 38%` / `oklch(0.55 0.20 155)`; the final dark primary is the approved landing mint `#00efa0` (`160.167 100% 46.863%`) with midnight text `#010510`. Dark subtle text increases from 45% to 65% white, and light subtle text to 68% ink, for readability. Dark primary contrast is **13.44:1**, auth primary **10.91:1**. Existing semantic warning/error/chart colors remain distinct.

Implementation: `src/components/design/product-workspace.css` owns the shared palette and primitives. `user-workspace.css` retains layout constraints instead of redefining the brand. Inbox, Questions, Materials and Analytics consume these tokens. The rejected slate canvas `#10171d`, raised `#191f27` and route-specific primary `#35d3a0` are removed from the workspace override.

## Evidence-led mismatch inventory and repairs

| Observed mismatch | Evidence / consequence | Implemented correction |
| --- | --- | --- |
| Six redesigned routes used a separate slate/teal system | Historical `globals.css` versus the `.reference-workspace` token block; abrupt color changes entering Preferences/Settings | Shared product tokens on every AppShell route; no new palette invented |
| Route names differed between sidebar, mobile bar and command palette; “search” only switched sections | Separate hardcoded arrays and topbar placeholder | `workspace-navigation.ts` is the shared IT/EN vocabulary; truthful section-switch label, 14 unique resolvable routes, active `aria-current`, exact admin root matching |
| Keyboard overlays lacked consistent focus control | Command palette and mobile drawer had no complete focus-return/trap behavior | Named dialogs, close controls, Escape, Tab trap, trigger focus return, inert mobile background; same hook for subscription modal |
| Command Enter reopened the palette | Browser test reproduced focus returning to the trigger before Enter default activation | Prevent default activation before running selected section action |
| Profile pages used long document flows and inconsistent form surfaces | 1366×768/1440×900 fixtures; dark readonly fields inherited near-white glass backgrounds | Pinned headings/actions and internally scrolling body; shared dark inputs, focus style and mobile 16px inputs |
| Bounded settings cards shrank and clipped contents | Visual inspection showed account/billing body hidden despite passing outer viewport bounds | Nonshrinking cards inside the scroll panel; explicit browser assertions for every card’s scroll/client height |
| Settings links pointed to absent anchors; name appeared editable with no save path | Existing `#account`/`#billing` links and uncontrolled name input | Real anchors, associated labels, honest readonly account name |
| Save success could erase newer unsaved-state indication | Preferences allowed edits during an outstanding save | Revision-aware dirty state; browser test edits during pending save and verifies another save is required |
| Empty CV redirected into onboarding | Existing empty-state `/onboarding` link could re-enter gating/setup rather than completing the profile task | In-place upload using the existing authenticated CV endpoint, same limit and server checks; error/file retention, retry, refresh; no new send trigger |
| CV download network failure had no explicit recovery | `downloadPdf` lacked catch | Visible retryable error toast |
| Failed Questions load resembled “no pending questions” | Existing rejection only added notice while empty list rendered | Dedicated error state and retry; saved answers and explicit application-resume policy retained |
| Error screen claimed a report had been received without reporting it | Global error copy | Honest global copy plus app-level retry/dashboard/report links preserving the shell |
| Referral/subscription fetch failures disappeared or masqueraded as no data | Missing error state; clipboard success reported before awaited completion | Recoverable load errors, retry, truthful clipboard failure, network error handling; no pricing or billing action policy changes |
| Signup and billing entry exceeded laptop height | Measured signup document height 792px and expired-trial height 783px at 1366×768 | Bounded auth form area and expired-trial panel, correct membership viewport calculation; mobile remains natural flow |
| Recovery/auth screens used disconnected layouts | Forgot/reset/verify had independent shells | Approved AuthShell reused; accessible errors and back links; CTA link contrast checked |
| Dense metadata shrank to 8–10px | Workspace, Inbox, Materials and Questions CSS | Core metadata increased to at least 11px; content typically 12–14px, mobile controls enlarged, meaningful desktop geometry rechecked |
| Applications could not scale to hundreds of records | Integrated pagination source and 723-record unit/720-record browser fixtures | 3 cards per stage, 10 table rows per page, independent stage pages, clamping and filter reset retained |
| Inbox was fragmented/read-only for application mail | Correct target `libfile_93c2210dabe881918422644f3e2b9c55`, visually inspected | Three-pane conversation, pinned composer, bounded lists, deliberate owned application-mail replies, durable drafts; Gmail remains readonly/external reply |
| No coherent user-to-admin feedback path | Integrated feedback candidate | Private user history and protected admin triage with active navigation and safe text rendering |

Secondary navigation destinations were checked for route existence. Analytics receives the same accent, heading scale and bounded content pane; existing metrics are unchanged. Admin overview matching no longer also selects its child pages; report access remains server protected. This does not introduce a new localization project: existing Italian-only profile/analytics prose remains Italian, while shared navigation and the main redesigned user/feedback/Inbox views retain IT/EN support.

## Verification

All browser identities, data and mutations are synthetic; external requests are blocked. PostgreSQL checks use ephemeral localhost PostgreSQL 16 clusters and mocked providers. No production credentials were loaded.

| Check | Result and meaningful coverage |
| --- | --- |
| `npm test` | PASS. Auth/Google auth, registration/trial, schema compatibility, worker gates, delivery evidence, replies, truthful answers, release pause/manual rollout, card onboarding, shared navigation, 723 owned application records |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS (final log under `output/verification/`); no production data. Public static DB-backed pages emit expected missing-`DATABASE_URL` fallback warnings in this credential-free build |
| `npm run test:feedback-postgres` | PASS. Exact migration on populated schema, auth/card/suspension/trial gates, CSRF, validation, ownership, admin denial, concurrent durable quotas, deletion cascade, fail-closed outages |
| `npm run test:integrated-postgres` | PASS. Both exact migrations applied to a populated schema derived from canonical live; existing User/Application/ApplicationReply preserved; resulting schema has zero Prisma diff; Inbox ownership, CSRF, recipient/threading, concurrency/idempotency, unknown retry, quota/pause, out-of-order delivery and security-code tests |
| Main workspace browser suite | PASS. Five actual view components, IT/EN desktop/mobile, filters, status updates, empty/error states, safe email text, map controls, light theme and no production requests |
| Applications browser suite | PASS. 720 records, 3-per-stage/10-per-table, independent page state, filter resets, deep links, last-page deletion, error recovery, IT/EN desktop/mobile, visible controls |
| Inbox browser suite | PASS. 56-message pagination, desktop bounds, mobile list/reader/back, draft preservation after mocked quota failure, stable send identity, Gmail fallback, safe text, no external requests |
| Feedback/admin browser suite | PASS. IT/EN, four widths, user errors/drafts, protected-admin fixture triage, pagination, text safety, keyboard/mobile/light |
| Product consistency browser suite | PASS. 16 actual public/profile view components at 1366×768, 1440×900, 390×844 and 320×740; no desktop document overflow (landing intentionally scrolls); internal cards/controls not clipped; keyboard/focus/retry/save/clipboard/upload behaviors |
| `git diff --check` | PASS |

Browser fixtures render the real view components with server/API boundaries replaced. Matching main before/after images use the same Arial fallback for comparability; the 16-view product suite also passed with the actual Inter font embedded from the successful build. The production font configuration remains unchanged. They do not prove live OAuth callback configuration, live Stripe/Resend availability, production schema state or production data-specific behavior. The local build and real-PostgreSQL route tests complement these fixtures; no customer session or actual provider delivery was exercised.

## Review artifacts (local only)

- `output/review/index.html`: side-by-side Dashboard, Discover, CV-per-position and Inbox comparisons plus final profile/auth/mobile views.
- `output/playwright/before-workspace/`: fresh captures at integrated pending-candidate commit `105494b`, before this consistency pass. These are **not live production screenshots**.
- `output/playwright/after-workspace/`: matching final fixtures.
- `output/playwright/inbox/inbox-target-revised-1366.png` and `inbox-target-revised-1440.png`: final target-aligned conversation composition.
- `output/playwright/product-consistency/`: viewport evidence, Settings/Preferences/CV/Questions/Analytics/auth/onboarding/billing captures and `qa-result.json`.
- `output/playwright/feedback/` and `after-pagination/`: dedicated feature QA artifacts.
- `output/verification/`: retained command logs and validation manifest.

References were downloaded and visually inspected using Library: the correct Inbox target above, plus the five original user-screen references. The known broken Inbox image was not used as the target. No artifacts were uploaded. Previously denied Applications screenshot uploads were neither retried nor reused or repackaged; they remain pending destination approval outside this candidate.

## Release prerequisites / remaining blockers

1. **Local candidate only.** Publication is not authorized in this task; live remains `977c766…`.
2. **Both additive migrations must precede release:** `20261015120000_feedback_reports` and `20261015220000_inbox_user_replies`. Inbox has no missing-schema fallback. The local migration/schema test is evidence of compatibility, not evidence they are applied in production.
3. Production migration planning must first resolve the known wrong US `DIRECT_URL` against the intended Frankfurt Neon project `curly-silence-16024948`, branch `br-aged-band-al1r48g9`, database `neondb`, and reconcile incomplete migration history. Do not blindly run migrate/db-push/reset. No production DB/config change was made here.
4. No live provider send test is justified by the reported Resend daily usage (118/100 at 20:30 UTC). Local provider mocks verify behavior; production capacity and an explicitly authorized release canary remain separate decisions.
5. Actual remote login/callback, deployed route checks and real-user data rendering remain a release-stage validation after authorization. Existing gates, counts, pricing, trial durations, Google identity rules and Gmail scopes were preserved.
