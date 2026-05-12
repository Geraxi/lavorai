# CHANGELOG — Landing & signup conversion overhaul

---

## Session: Language consistency + proof unification + trust visibility

### P1 — Language consistency (Italian-only public surface)
- **Disabled `en` locale** (`src/i18n/routing.ts`, `src/i18n/request.ts`):
  audit found `messages/en.json` was ~80% Italian copy. Geo-redirected
  non-IT visitors were being served Italian dressed as English — worse
  than just shipping Italian. Locked to `it` until en.json is properly
  translated and QA'd. Detection plumbing left in place so unfreezing
  is a one-line revert.
- `/privacy` page: title `"Privacy Policy"` → `"Informativa privacy"`
  (both metadata title and visible H1).
- `signup`: `"privacy policy"` → `"informativa privacy"` in consent
  label + error message.
- `features.tsx`: `"Submit diretto su ATS"` → `"Invio diretto sui
  portali ATS"`; `"Tracking apertura reale"` → `"Tracciamento apertura
  mail in tempo reale"`.
- `stats.tsx` eyebrow: `"Auto-apply by the numbers"` →
  `"Numeri reali della piattaforma"`.

### P2 — Proof unification + honest placeholders
- **Stats now pull from `SUCCESS_METRICS`** (single source in
  `src/lib/marketing-content.ts`). Removed duplicated hardcoded array
  in `stats.tsx`.
- Updated `SUCCESS_METRICS` to match the spec: 4 cards covering
  *active candidates*, *applications sent*, *time saved*, *application
  → interview ratio*. Each entry now carries a `placeholder: true` flag.
- UI renders a discreet `*` next to placeholder labels and a transparent
  "Numeri segnati con asterisco sono stime editoriali" footnote linked
  to `/privacy` for honesty.
- **Testimonials now pull from `TESTIMONIALS`** (same single source).
  Removed duplicated array in `testimonials-v2.tsx`. Each card now also
  renders the `outcome` field as a green pill (`→ 12 colloqui in 3
  settimane`) — concrete proof signal previously buried in source.

### P3 — Trust visibility at conversion points
- Signup form gets a "Cosa succede dopo" 4-step checklist (green panel
  above submit) clarifying that auto-apply is **OFF by default** and
  every escalation step requires explicit user action. Directly
  addresses the highest objection class (loss of control).
- Hero trust strip (GDPR · 1-click delete · no LinkedIn creds · pause)
  was already in place — verified, no change needed.

### Deferred (documented in TODO-LAUNCH.md)
- P4 premium UI system pass + P5 custom icon set: scope ~3 days, would
  be net-negative if half-done. Tracked as a single coherent task.
- P6 free CV audit lead magnet: `/analizza-cv` and `/optimize` routes
  exist as scaffolding; full UI flow + ATS scoring placeholder logic
  still to wire.
- P7 signup refinement beyond the trust checklist landed this session.
- P8 B2B discovery layer: zero scaffolding today. Greenfield.
- P9 analytics events constants file: partial coverage exists in
  `src/lib/analytics.ts` (FAQ_EXPAND, TRUST_SECTION_VIEW). Needs the
  full P9 event catalogue.

---

## What changed

### Landing page (`src/app/(marketing)/page.tsx`)
Restructured the funnel order from a generic feature-pitch flow into a
conversion-aware sequence:

1. Hero (outcome promise + dual CTA + trust strip)
2. How it works (5-step flow)
3. **NEW**: Lead magnet banner pointing to existing `/optimize` (free CV audit)
4. **NEW**: Automation Boundaries (cosa è automatico / cosa confermi / cosa controlli)
5. **NEW**: Per chi è (4 personas)
6. Problema (existing)
7. Stats (existing)
8. Testimonials (existing, now editable from `marketing-content.ts`)
9. **NEW**: Why-not-ChatGPT differentiation
10. **NEW**: Trust block (6 GDPR/security claims)
11. Pricing (now with risk-reducer chips)
12. **NEW**: After-signup checklist (5 steps with durations)
13. FAQ (rewritten around 7 objections)
14. **NEW**: Referral placeholder block
15. Final CTA

### Hero (`src/components/hero.tsx`)
- Headline rewritten outcome-first: "Manda più candidature di qualità
  senza passare le serate a ricopiare il CV" (replaces vague AI claim)
- Secondary low-friction CTA "Analizza il mio CV gratis" → /optimize
- Trust strip with 4 reassurances: GDPR · 1-click delete · no LinkedIn
  credentials · pause anytime
- Two-tier portals strip: discovery (LinkedIn/Indeed/InfoJobs/Subito)
  vs ATS apply (Greenhouse/Lever/Ashby/SmartRecruiters/Workable) —
  honesty about WHERE we actually submit
- Both primary and secondary CTAs wired to analytics events

### NEW: Automation Boundaries
`src/components/sections/automation-boundaries.tsx`
Three-column clarification: Automatic / You Confirm / You Control.
Directly addresses the user's stated problem #2 ("the user doesn't
understand what's automatic vs what's user-approved").

### NEW: Trust block
`src/components/sections/trust-block.tsx`
6 GDPR claims: EU servers, encryption, explicit consent, total control,
export, deletion. Coherent with `/privacy` but readable. Includes
deep-link to full policy.

### NEW: Lead magnet banner
`src/components/sections/lead-magnet-banner.tsx`
Surfaces the existing `/optimize` free CV audit prominently between
"How it works" and "Boundaries". No new backend — the audit flow with
ATS score + DOCX + suggestions already exists.

### NEW: Content blocks
`src/components/sections/content-blocks.tsx`
Four sections in one file:
- `SectionPersonas` — 4 target personas (mid-senior / junior /
  expat / freelance)
- `SectionWhyNotChatGpt` — 4 differentiation points
- `SectionAfterSignup` — 5 post-signup steps with durations
- `SectionReferral` — placeholder mailto: waitlist for future referral

### FAQ (`src/components/sections/faq.tsx`)
Rewritten around 7 explicit objection questions (data safety / control /
portal coverage / quality / review / audience / post-signup). Each
expand fires an analytics event with question text. Bilingual content.

### Signup (`src/app/signup/page.tsx`)
- "Cosa succede dopo" checklist (4 numbered steps with time stamps)
- Default-mode reassurance: "Default sicuro: parte in Hybrid, Auto
  solo se la attivi tu"
- Trust microcopy under submit: 3 free apps · no card · 1-click cancel

### Pricing (`src/components/sections/pricing.tsx`)
3 risk-reducer chips under the heading: 3 free apps · self-service
cancel · zero setup fee.

### Marketing infrastructure
- `src/lib/analytics.ts` — single source of truth for event names +
  `trackEvent()` + `observeOnce()` view-tracker. dataLayer push for
  GTM compatibility, console log in dev.
- `src/lib/marketing-content.ts` — all proof/testimonial/FAQ/persona
  content moved into one editable file. Replace placeholders here
  without touching JSX.

### i18n
~50 new translation keys added to `messages/it.json` and `messages/en.json`.
All new sections fully bilingual.

## Why this should improve conversion

| Lever | Before | After | Conversion impact |
|---|---|---|---|
| Headline | Vague ("Candidarsi non è più il tuo lavoro") | Outcome ("Manda più candidature di qualità senza...") | High — outcome > poetry |
| Secondary CTA | None | "Analizza il mio CV gratis" → /optimize | High — captures non-ready visitors |
| Trust strip | None | 4 reassurances under hero | Medium — answers objections before they form |
| Automation clarity | Vague "ogni 30min" claim | Explicit 3-column Auto/Confirm/Control | High — kills "I'll lose control" fear |
| Privacy proof | Footer link only | Full 6-claim trust block | High — GDPR audience is risk-averse |
| Post-signup expectation | Generic "Verifica email" | 4-step numbered checklist with durations | Medium — reduces abandon-at-confirmation |
| Lead capture | Only signup form | Lead magnet banner + secondary hero CTA | High — opens 2nd funnel for cold traffic |
| Pricing trust | Just "IVA inclusa" footer | 3 risk-reducer chips above price cards | Medium — reduces price-comparison hesitation |
| Differentiation vs ChatGPT | Not addressed | Dedicated "perché non basta ChatGPT" section | Medium — disarms #1 alternative |

## What content I still need to replace with real data

- `TESTIMONIALS` in `src/lib/marketing-content.ts` — currently 3
  realistic-sounding placeholders. **Must replace** with real testimonials
  (with opt-in) before launching paid acquisition. Marked clearly in code.
- `SUCCESS_METRICS` — `2.000+`, `30s`, `8gg` are defensible placeholders
  but should be backed by real cohort data. **Validate before public claims.**
- Referral block — currently mailto: waitlist. **Implement real
  referral flow** before promoting publicly.

## Files changed

### New
- `src/lib/analytics.ts`
- `src/lib/marketing-content.ts`
- `src/components/sections/automation-boundaries.tsx`
- `src/components/sections/trust-block.tsx`
- `src/components/sections/lead-magnet-banner.tsx`
- `src/components/sections/content-blocks.tsx`
- `CHANGELOG.md`
- `TODO-LAUNCH.md`

### Modified
- `src/app/(marketing)/page.tsx` — section ordering
- `src/components/hero.tsx` — copy, dual CTA, trust strip, two-tier portals
- `src/components/sections/faq.tsx` — wired to FAQ_OBJECTIONS, analytics
- `src/components/sections/pricing.tsx` — risk-reducer chips
- `src/app/signup/page.tsx` — checklist, trust microcopy, default-mode note
- `messages/it.json` + `messages/en.json` — new keys for all sections
