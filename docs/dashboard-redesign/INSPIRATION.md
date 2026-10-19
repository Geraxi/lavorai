# Dashboard Design Inspiration

**Date**: 2026-10-19  
**Purpose**: Document specific patterns borrowed from best-in-class SaaS dashboards

---

## Reference Products

- **Linear** (linear.app) - Issue tracking, project management
- **Vercel** (vercel.com/dashboard) - Deployment platform
- **Stripe** (dashboard.stripe.com) - Payment infrastructure
- **Mercury** (mercury.com) - Banking platform
- **Arc** (arc.net) - Browser (new tab page)
- **Raycast** (raycast.com) - Command palette, extensions
- **Attio** (attio.com) - CRM platform

---

## 1. Card Anatomy (Linear, Stripe)

### Structure
```
┌─────────────────────────────────────┐
│ Icon  Title               Badge     │ ← Header (16px padding)
│                                     │
│ Primary content (24-32px padding)  │ ← Body
│ • Metrics in grid                   │
│ • List items with hover states      │
│ • Clear hierarchy                   │
│                                     │
│ Action link →                       │ ← Footer (subtle, right-aligned)
└─────────────────────────────────────┘
```

### CSS Pattern
```css
.card {
  background: var(--bg-elev);
  border: 1px solid var(--border-ds);
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: var(--border-hover);
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-ds);
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-body {
  padding: 24px 20px;
}

.card-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-ds);
  display: flex;
  justify-content: flex-end;
}
```

**LavorAI Usage**:
- Needs Attention card
- Application Status card
- CV/Documents card
- Interviews card

---

## 2. Spacing Scale (Linear, Vercel)

**4-based scale** (multiples of 4px):

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Icon-to-text gap, tight inline spacing |
| `sm` | 8px | Between related items in a list |
| `md` | 12px | Default card border-radius |
| `base` | 16px | Card padding (header/footer) |
| `lg` | 20px | Card horizontal padding |
| `xl` | 24px | Card body padding, section spacing |
| `2xl` | 32px | Between major sections |

**LavorAI CSS Variables**:
```css
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-base: 16px;
  --space-lg: 20px;
  --space-xl: 24px;
  --space-2xl: 32px;
}
```

---

## 3. Typography (Linear, Stripe, Mercury)

### Hierarchy
```css
/* Page title (Dashboard) */
.page-title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* Section title (Needs Attention, Interviews) */
.section-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

/* Card title */
.card-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

/* Body text */
.body-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg);
}

/* Subtle text (metadata, timestamps) */
.text-subtle {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--fg-subtle);
}

/* Small caps (KPI labels) */
.label-caps {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-muted);
}
```

**Constraints**:
- Font family: System stack (already in product-workspace.css)
- No font sizes below 11px (accessibility)
- Negative letter-spacing only on 600+ weight titles

---

## 4. Icon Style (Linear, Arc)

**Lucide Icons** (consistent outline, 1.5px stroke):

| Context | Size | Stroke | Color |
|---------|------|--------|-------|
| Card header | 18px | 1.5px | `var(--fg-muted)` |
| List item | 16px | 1.5px | `var(--fg-subtle)` |
| Inline badge | 14px | 1.5px | `var(--fg-subtle)` |
| Button icon | 16px | 1.5px | inherit |

**One family rule**: All icons must be Lucide outline style. No mixing with filled icons.

**LavorAI Icon Component** (already exists):
```tsx
<Icon name="inbox" size={18} />
```

Available icons:
- `inbox`, `send`, `check-circle`, `alert-circle`, `clock`
- `briefcase`, `file-text`, `user`, `calendar`
- `trending-up`, `bar-chart`, `target`
- `chevron-right`, `external-link`, `plus`

---

## 5. Empty States (Stripe, Mercury)

### Pattern
```
┌─────────────────────────────────────┐
│                                     │
│         [Icon 40px, muted]          │ ← Centered
│                                     │
│     No [items] yet                  │ ← 15px, semi-bold
│     [Helpful one-line context]      │ ← 13px, subtle
│                                     │
│        [Primary CTA button]         │ ← Optional
│                                     │
└─────────────────────────────────────┘
```

**Examples**:
- No unread messages → "All caught up"
- No interviews → "No upcoming interviews"
- No applications → "Start applying" CTA

**Style**:
```css
.empty-state {
  padding: 48px 24px;
  text-align: center;
  color: var(--fg-subtle);
}

.empty-state-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  opacity: 0.4;
}

.empty-state-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--fg);
}

.empty-state-description {
  font-size: 13px;
  color: var(--fg-subtle);
  max-width: 280px;
  margin: 0 auto 20px;
}
```

---

## 6. Compact Timelines (Linear, Attio)

### Structure
```
┌─────────────────────────────────────┐
│ ● Event title          2h ago       │ ← 14px text, 8px dot
│ ○ Event title          1d ago       │ ← Hollow = older/less important
│ ○ Event title          3d ago       │
│                                     │
│ View all activity →                 │ ← Footer link
└─────────────────────────────────────┘
```

**CSS**:
```css
.timeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
}

.timeline-dot.hollow {
  background: transparent;
  border: 2px solid var(--border-ds);
}

.timeline-content {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.timeline-timestamp {
  font-size: 12px;
  color: var(--fg-subtle);
  flex-shrink: 0;
}
```

**LavorAI Usage**:
- Recent activity: "Applied to [company]", "Recruiter replied", "Interview scheduled"
- Limit: Latest 5 events
- Relative timestamps: "2h ago", "1d ago", "3d ago"

---

## 7. Responsive Grid (Vercel, Raycast)

### Desktop (1440px+)
```
┌─────────────────────────────────────────────────────────┐
│ [Main column 66%]         [Sidebar 33%]                 │
│ ┌──────────────────────┐  ┌──────────────┐            │
│ │ Needs Attention      │  │ CV Thumbnail │            │
│ └──────────────────────┘  └──────────────┘            │
│ ┌──────────────────────┐  ┌──────────────┐            │
│ │ Application Status   │  │ Interviews   │            │
│ └──────────────────────┘  └──────────────┘            │
│ ┌──────────────────────┐  ┌──────────────┐            │
│ │ Activity Timeline    │  │ Opportunities│            │
│ └──────────────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────┘
```

### Tablet (768px)
```
┌─────────────────────────────┐
│ [Single column]             │
│ ┌─────────────────────────┐ │
│ │ CV Thumbnail (compact)  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Needs Attention         │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Application Status      │ │
│ └─────────────────────────┘ │
│ ...                         │
└─────────────────────────────┘
```

### Mobile (375px)
```
┌───────────────┐
│ [Full width]  │
│ ┌───────────┐ │
│ │ Compact   │ │
│ │ cards     │ │
│ └───────────┘ │
│ ┌───────────┐ │
│ │ Stacked   │ │
│ └───────────┘ │
└───────────────┘
```

**CSS Grid**:
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
}

@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dashboard-grid {
    gap: 16px;
  }
}
```

---

## 8. KPI Display (Stripe, Mercury)

### Structure
```
┌─────────────────────────────────────┐
│ 12          ↑ 20%                   │ ← Large number + trend
│ Confirmed submissions               │ ← Label
└─────────────────────────────────────┘
```

**CSS**:
```css
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kpi-value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.kpi-trend {
  font-size: 14px;
  font-weight: 500;
  color: var(--success);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kpi-label {
  font-size: 13px;
  color: var(--fg-subtle);
  font-weight: 500;
}
```

**LavorAI Usage**:
- Confirmed submissions (not "invii confermati" - use evidence count)
- Recruiter replies (not "con risposte" - use distinct count)
- Interviews scheduled
- Offers received

**NO duplicated KPIs**: Each metric shown once, with clear definition.

---

## 9. Hover States (Linear, Arc)

**Subtle, fast transitions**:
```css
.interactive-card {
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.interactive-card:hover {
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
  border-color: var(--border-hover);
  transform: translateY(-1px);
}

.link-subtle {
  color: var(--fg-subtle);
  text-decoration: none;
  transition: color 0.15s;
}

.link-subtle:hover {
  color: var(--fg);
}

.button-ghost {
  background: transparent;
  border: 1px solid var(--border-ds);
  transition: all 0.15s;
}

.button-ghost:hover {
  background: var(--bg-subtle);
  border-color: var(--border-hover);
}
```

---

## 10. Focus States (Accessibility)

**Keyboard navigation** (Linear pattern):
```css
.focusable:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 6px;
}

/* Remove default browser outline */
.focusable:focus {
  outline: none;
}
```

---

## Design Tokens Summary

```css
:root {
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-base: 16px;
  --space-lg: 20px;
  --space-xl: 24px;
  --space-2xl: 32px;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;

  /* Shadows */
  --shadow-card: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-card-hover: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-card-active: 0 6px 16px rgba(0,0,0,0.12);

  /* Transitions */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Constraints Applied

**MUST HAVE**:
- ✅ Matte black/charcoal background (no globe)
- ✅ Restrained green accents (`#00efa0` / `#059669`)
- ✅ One outline icon family (Lucide)
- ✅ 1px borders (not heavy)
- ✅ Generous spacing (24-32px card padding)
- ✅ Responsive 1440/768/375
- ✅ No personal greeting
- ✅ No neon/chrome/excessive glass

**MUST NOT HAVE**:
- ❌ Globe map (removed)
- ❌ Duplicated KPIs (single source)
- ❌ Admin UI for customers (server-hidden)
- ❌ Fabricated data (evidence-backed only)
- ❌ Confusing status labels (clear lifecycle)

---

**References**: Linear issue tracker, Vercel deployment dashboard, Stripe payments dashboard, Mercury banking interface, Arc browser new tab, Raycast command palette, Attio CRM workspace.

**Implementation**: `src/app/(app)/dashboard/page-redesign.tsx` and `dashboard-redesign.css`
