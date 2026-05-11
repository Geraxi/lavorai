# TODO-LAUNCH — pre-launch checklist

Items to verify, swap, or wire before pushing paid acquisition or
making claims publicly. Order = priority.

## 🔴 Critical (block paid traffic / public claims)

### Legal & compliance
- [ ] **Privacy policy review** with a legal advisor: align our trust
      block claims (`marketing-content.ts` → `TRUST_CLAIMS`) with the
      current `/privacy` page. Specifically verify:
  - Storage location claim ("Neon · Frankfurt") matches actual infra
  - Encryption claims (TLS 1.3 + AES-256) are technically accurate
  - 30-day backup retention claim
  - GDPR data subject rights (export/delete) — wording matches policy
- [ ] **Cookie banner copy** — review wording for our actual cookie usage
- [ ] **Stripe terms** + Italian VAT disclosure on pricing page
- [ ] **"Cancelli in 1 click da Stripe"** claim — verify the Stripe
      customer portal is enabled and self-service cancellation works
      without admin intervention
- [ ] If we keep the **"2.000+ candidati italiani"** number anywhere
      public, confirm we can defend it from real signups (currently a
      placeholder in `marketing-content.ts → SUCCESS_METRICS`)

### Proof points to replace with real data
- [ ] `TESTIMONIALS` — currently 3 realistic placeholder names
      (Marco R. / Giulia S. / Andrea C.). Replace with:
  - Real first name + last initial of consenting users
  - Real outcome metric (e.g., "12 colloqui in 3 settimane")
  - Approval email on file before publishing
  - Optional: small avatar (initials block is acceptable for v1)
- [ ] `SUCCESS_METRICS`:
  - "2.000+" → real registered user count (from prisma.user.count)
  - "30s" — easily defensible (timer from `/optimize` is ~30s wall)
  - "8gg" tempo mediano al primo colloquio → **needs real cohort data**.
    Currently a guess. If we can't back it, swap to a different metric
    (e.g., "5 candidature/giorno mediana per utente attivo").
- [ ] `FAQ_OBJECTIONS` q1 → q3 reference specific tech (Neon · Frankfurt,
      Greenhouse/Lever list). Verify these claims match production state
      monthly — add ATS to the marketing list when we add the adapter.

## 🟡 High-value (do before scaling beyond 100 paying users)

### Analytics wiring
- [ ] Connect a real analytics provider. Recommended: PostHog (open
      source, EU-hosted option, generous free tier). Replace the
      `trackEvent()` body in `src/lib/analytics.ts`:
      ```ts
      import posthog from 'posthog-js';
      posthog.capture(name, payload);
      ```
- [ ] Verify all event names from `AnalyticsEvent` enum fire in
      production. Spot-check in dev with `console.debug` logs (already on).
- [ ] Set up a funnel report: HERO_CTA_PRIMARY → SIGNUP_START →
      SIGNUP_SUCCESS → first SUCCESS application within 24h
- [ ] Set up a separate funnel for lead magnet: LEAD_MAGNET_OPEN →
      LEAD_MAGNET_SUBMIT → LEAD_MAGNET_RESULT_VIEW → eventual SIGNUP

### Email lifecycle flows
- [ ] **Day 0**: Verification email (✅ already wired via Resend)
- [ ] **Day 1**: "Carica il CV per attivare l'auto-apply" if user hasn't
      uploaded CV within 24h of signup
- [ ] **Day 3**: First-week summary if any applications sent — total
      count + "Viste" tracking pixel hits
- [ ] **Day 7**: Re-engagement if 0 applications sent (suggest:
      lower matchMin or expand role list)
- [ ] **Day 14**: Trial-soft-end email for free users hitting the
      3-application cap
- [ ] **Day 30**: Win-back for churned paying users
- [ ] **Daily digest opt-in**: end-of-day summary of new applications
      (currently no email per submit, only on response)

### Lead magnet polish
- [ ] Add an email opt-in checkbox on the `/optimize` result screen:
      "Voglio ricevere il digest settimanale di offerte simili"
- [ ] Add a "share my result" link from `/optimize` result for social
      proof loops (Privacy-aware: only share the score, not the CV)
- [ ] Add an "upgrade to LavorAI Pro" CTA at the bottom of the result
      with the user's email pre-filled in signup

## 🟢 Nice-to-have (after first 100 paying users)

### Referral program
- [ ] Move `SectionReferral` from mailto: waitlist to real product.
      Needs:
  - New schema: `Referral { referrerId, refereeId, status, creditApplied }`
  - Stripe credit application logic (apply 2 weeks free to both)
  - Unique per-user referral codes on the dashboard
  - Email template for "your friend signed up"
- [ ] A/B test referral reward: 2 weeks free vs €15 off vs both 1 month
- [ ] Track REFERRAL_INVITE_SHARE → SIGNUP attribution

### Pricing experiments
- [ ] Add **monthly vs quarterly** toggle on `SectionPricing` — test
      whether 20% discount on quarterly increases LTV
- [ ] Test **money-back guarantee** copy: "Rimborso totale entro 14gg"
      vs current "Cancelli in 1 click". Currently we don't claim
      money-back — would require checkout flow + Stripe refund handling.
- [ ] Test **per-application pricing** as a third option for users who
      don't want subscription commitment

### Exit intent + soft modal
- [ ] Add exit-intent detection on landing pages → trigger lead magnet
      modal with the same `/optimize` link
- [ ] Soft modal on `/pricing` after 30s of view without action → "Vuoi
      provare gratis prima? 3 candidature, no carta"

### SEO content
- [ ] Add blog/guides routes for SEO: "come scrivere CV in italiano",
      "ATS optimization checklist", "perché LinkedIn easy apply non
      basta". Each links back to homepage CTAs.
- [ ] Schema.org markup: Product, FAQPage (using the FAQ_OBJECTIONS list),
      Organization (with logo, EU registered address)
- [ ] Sitemap + robots.txt verified
- [ ] OpenGraph + Twitter card images per major page

## ⚪ Polish / consistency

- [ ] Remove `motion` `useTransform`/`useMotionValue` from server-side
      paths (verify `next build` doesn't hydrate motion on server-only
      pages)
- [ ] Audit all `<Link>` components: ensure `prefetch` is on for hero
      CTAs, off for footer/legal links
- [ ] Verify mobile breakpoint on `SectionAutomationBoundaries` and
      `SectionTrustBlock` — both use 3-col grid that should stack at
      <768px (currently using `md:grid-cols-3` which is correct)
- [ ] Accessibility pass: verify all new sections have semantic headings
      (h2 → h3), aria-labels on icon-only buttons, focus-visible states
      on CTAs
- [ ] Performance: lazy-load `SectionTestimonialsV2` (motion-heavy) below
      the fold
- [ ] Print stylesheet for `/optimize` result screen (users print PDFs)

## Experiments to run

Once analytics is wired, run these in priority order:

1. **Hero headline A/B** — current outcome-first copy vs an aspirational
   variant. Hypothesis: outcome wins by 15-25%.
2. **Dual CTA placement** — should the secondary "Analizza CV" button
   be above the primary "Inizia gratis" or below? Default below for
   habit; test above for low-trust traffic.
3. **Trust strip position** — under CTA (current) vs under the headline.
4. **Lead magnet position** — section 3 (current) vs section 1.5
   (between hero and how-it-works) vs as sticky banner.
5. **Boundary table** — 3-column (current) vs flat list with toggle.
6. **Pricing toggle** — monthly only vs monthly+quarterly. Quarterly
   = 20% discount.
