# Dashboard Redesign — Design Inspiration

**Goal**: Premium, calm, tech-focused dashboard (Linear/Vercel/Stripe/Mercury aesthetic)  
**Palette**: Matte black/charcoal, restrained green accents, fine borders, no neon glow  
**Motion**: Restrained only — fade/slide-in on load, hover lift, number count-up, respects `prefers-reduced-motion`

---

## Inspiration Sources

### 1. 21st.dev — Polished React/shadcn Components
**URL**: https://21st.dev  
**Key Observations**:
- **Card treatments**: Clean cards with subtle borders (`1px solid var(--border)`), no heavy shadows
- **Stat tiles**: Compact metric cards with large numbers (28-32px), small labels (11-12px uppercase), icon accent in corner
- **Hover states**: Minimal border color shift + 2-3px translateY lift + subtle shadow increase
- **Spacing**: Generous padding (18-24px in cards), consistent 12-16px gaps in grids
- **Typography**: Clear hierarchy with 32/16/14/13/12px scale, -0.02em letter-spacing on large numbers
- **Empty states**: Centered icon (40px, muted color), title + description + optional CTA button

**Concrete patterns adopted**:
- ✅ `.dashboard-kpis` grid with `repeat(4, 1fr)` → `repeat(2, 1fr)` on tablet → `1fr` on mobile
- ✅ KPI cards: 26px value, 11.5px uppercase label, subtle hover lift with border shift
- ✅ Progress tiles: Icon + count + label in horizontal layout, color-coded (blue/green/amber/gray/red)
- ✅ Empty states: 40px icon, 15px title, 13px description, centered, max-width: 280px
- ✅ Section cards: `background: rgba(255,255,255,0.03)`, `border: 1px solid rgba(255,255,255,0.08)`, 2rem radius

---

### 2. motionsites.ai — Tasteful Motion
**URL**: https://motionsites.ai  
**Key Observations**:
- **Load animations**: Staggered fade + slide-in (0-40px translateY), 400-600ms duration, ease-out timing
- **Hover micro-interactions**: Quick 140-200ms transitions, subtle scale (1.02-1.05), shadow expansion
- **Number animations**: Count-up from 0 to target over 800-1200ms with eased timing function
- **Scroll reveals**: Elements fade in as they enter viewport (IntersectionObserver or motion/react `useInView`)
- **Respects motion preferences**: All animations wrapped in `@media (prefers-reduced-motion: reduce) { transition: none; }`

**Concrete patterns adopted**:
- ✅ KPI staggered entrance: `delay: index * 0.08` (80ms stagger), 550ms duration, ease-out curve
- ✅ Number count-up: Framer Motion `animate(motionValue, target, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })`
- ✅ Hover lift on cards: `whileHover={{ y: -2 }}`, 350ms cubic-bezier(0.22, 1, 0.36, 1)
- ✅ Timeline items: Fade in with `useInView`, no animation if `prefers-reduced-motion`
- ✅ Initial load: `initial={{ opacity: 0, y: 16 }}`, `animate={{ opacity: 1, y: 0 }}` on viewport entry

---

### 3. godly.design — Top-Tier Web Design
**URL**: https://godly.design  
**Key Observations**:
- **Premium matte aesthetic**: Flat colors, no gradients except subtle ambient radial fades in backgrounds
- **Fine 1px borders**: Separation by tone first (background steps), borders second (hairline accents)
- **Restrained color**: Accent color (green) used sparingly — active states, CTAs, evidence indicators only
- **Generous whitespace**: 24-32px vertical rhythm, cards never crammed, breathing room between sections
- **Consistent icon family**: Single outline icon set (Lucide in our case), 1.5-1.6px stroke, 16-18px size
- **Typography discipline**: 2-3 font weights max (400 regular, 500 medium, 600 semibold), tight line-height (1.2-1.4)

**Concrete patterns adopted**:
- ✅ Matte black base: `--bg: #0a0b0b`, `--bg-elev: rgba(255,255,255,0.04)`, no blue cast
- ✅ Green accent: `--primary-ds: oklch(0.55 0.20 155)`, used only for active/hover/evidence states
- ✅ Fine borders: `--border-ds: rgba(255,255,255,0.08)`, `--border-strong: rgba(255,255,255,0.16)`
- ✅ Section spacing: 24px gap between cards, 18px internal card padding, 12-16px component gaps
- ✅ Lucide icons: Consistent 16-18px size, 1.6px stroke (via globals), used in every section head
- ✅ Typography: 32px page title, 16px section titles, 13-14px body, 12px metadata, 11px labels

---

## Applied Design Decisions

### Layout (Desktop 1440px)
- **KPI row**: Full-width 4-column grid (`repeat(4, 1fr)`), 16px gap, compact cards with icon + value + label
- **2-column grid**: Main content (`1fr`) + sidebar (`380px`), 24px gap
- **Main column**: Next step highlight → Attention queue → Progress tiles → Recent activity timeline
- **Sidebar column**: CV card → Profile checklist → Upcoming interviews → Opportunities summary

### Layout (Tablet 768px)
- **KPI row**: 2x2 grid (`repeat(2, 1fr)`), 12px gap
- **Main + sidebar**: Single column (`1fr`), sidebar becomes multi-column auto-fit grid

### Layout (Mobile 375px)
- **KPI row**: 2x2 compact grid or single column if space tight
- **Everything**: Single column, 16px padding, bottom nav clearance (add `pb-20` to main container)

### Motion (Restrained)
1. **KPI entrance**: Staggered fade + slide-in, 80ms per card, 550ms duration, `cubic-bezier(0.22, 1, 0.36, 1)`
2. **Number count-up**: Animate from 0 → target over 1.1s, same easing, tabular numbers (`font-feature-settings: "tnum"`)
3. **Card hover**: `translateY(-2px)`, border color shift, shadow increase, 350ms duration
4. **Timeline items**: Fade in on scroll with `useInView` (once), no animation if reduced motion
5. **All animations**: Wrapped in `@media (prefers-reduced-motion: reduce) { transition: none; transform: none; }`

### Typography
- **Page title**: 32px, 650 weight, -0.035em spacing (removed — we use topbar instead)
- **Section heads**: 16px title with icon, 500 weight, inline actions (13px)
- **KPI value**: 26px, 600 weight, -0.02em spacing, tabular numbers
- **KPI label**: 11.5px, 500 weight, uppercase, 0.04em spacing, muted color
- **Card body**: 13-14px, 400 weight, 1.4 line-height
- **Metadata/timestamps**: 12px, muted color, monospace for time values

### Color Usage (Restrained Green)
- **Primary (green)**: Active nav, hover borders, evidence indicators, CTAs, primary buttons
- **Amber**: Warnings, in-flight states, attention badge
- **Red**: Errors, failed states, destructive actions
- **Gray/muted**: Default state, borders, metadata, disabled
- **NO**: Neon glow, heavy glass (backdrop-filter on cards), repeated rainbow accents

---

## Files Modified
- `src/app/(app)/dashboard/page.tsx` — main dashboard page structure
- `src/app/(app)/dashboard/dashboard.css` — all dashboard-specific styles
- `src/components/design/kpi.tsx` — KPI component with motion
- `docs/dashboard-redesign/INSPIRATION.md` — this file

## Testing Checklist
- [ ] Desktop 1440px populated: KPIs in 4-col row, 2-col grid layout visible
- [ ] Desktop 1440px empty user: Empty states render correctly, no data errors
- [ ] Desktop 1440px non-admin: Admin links hidden, user metrics only
- [ ] Tablet 768px populated: KPIs 2x2, main + sidebar in 1 column
- [ ] Mobile 375px populated: KPIs 2x2 or 1 col, full-page scroll, bottom nav clearance
- [ ] Motion respects `prefers-reduced-motion: reduce`
- [ ] Numbers count up on first view, not on every scroll
- [ ] Hover states work on cards, timeline items, checklist items
- [ ] All data from `dashboard-metrics-shared.ts`, no fabricated counts
- [ ] TypeScript compiles, tests pass, build succeeds
