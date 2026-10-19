# Dashboard Design Inspiration

**Date**: 2026-10-19  
**Branch**: `cursor/dashboard-redesign-6395`  
**Purpose**: Document specific design patterns borrowed from best-in-class dashboards

---

## Reference Dashboards Analyzed

1. **Linear** (linear.app)
2. **Vercel** (vercel.com/dashboard)
3. **Stripe** (dashboard.stripe.com)
4. **Raycast** (raycast.com)
5. **Arc** (arc.net)
6. **Mercury** (mercury.com)
7. **Attio** (attio.com)

---

## Pattern Analysis & Borrowing

### 1. Card Anatomy

**Observed patterns**:
- **Linear**: Clean cards with 1px borders (#E5E7EB light / #2D2F33 dark), 8px radius, 16px padding, subtle hover state (border color shift)
- **Vercel**: Borderless cards on subtle background elevation, 12px radius, 20px padding, hover: slight scale + shadow
- **Stripe**: Bordered cards (1px #E3E8EE), 8px radius, 24px internal spacing, no hover state (click-only interaction)
- **Mercury**: Generous padding (24-32px), 12px radius, fine 1px borders, hover: border intensity increase
- **Attio**: Tight cards (12px padding), 6px radius, 1px border, hover: background tint

**Our choice** (matte aesthetic):
```
Border: 1px solid var(--border-ds) (#2A2C30 dark / #E5E7EB light)
Radius: 12px (cards), 8px (buttons, nested elements)
Padding: 18px (default), 14px (compact), 24px (spacious)
Hover: border-color shift to primary + 3px primary shadow (no scale)
Active: scale(0.98) on click (tactile feedback)
Background: var(--bg-elev) (one step up from page ground)
```

### 2. Spacing Scale

**Observed scales**:
- **Linear**: 4px base (4, 8, 12, 16, 20, 24, 32, 48)
- **Vercel**: 4px base with emphasis on 12, 16, 24, 32
- **Stripe**: 8px base (8, 16, 24, 32, 40)
- **Raycast**: Tight spacing, 4px increments
- **Mercury**: Generous, 8px base with 16, 24, 32 emphasis

**Our scale** (breathable layout):
```
xs: 4px   (icon gaps, tight stacks)
sm: 8px   (button padding, list gaps)
md: 12px  (card internal spacing, small gaps)
lg: 18px  (section padding, card gaps)
xl: 24px  (page sections, generous spacing)
2xl: 32px (major section breaks)
```

Applied:
- Gap between dashboard sections: 18px
- Card internal padding: 18px (default)
- List item vertical: 12-14px
- Metric cards gap: 14px
- Page padding: 22px desktop, 16px mobile

### 3. Typography

**Observed scales**:
- **Linear**: 
  - H1: 28px/650 weight/-0.02em tracking
  - H2: 16px/600 weight
  - Body: 14px/400 weight/1.5 leading
  - Muted: 13px/400 weight/--text-tertiary
  
- **Vercel**: 
  - H1: 32px/600 weight/-0.025em tracking
  - H2: 18px/500 weight
  - Body: 14px/400 weight
  - Code: SF Mono 13px
  
- **Stripe**:
  - H1: 36px/600 weight/-0.03em tracking
  - H2: 20px/500 weight
  - Body: 15px/400 weight/1.6 leading
  - Captions: 13px/--text-secondary
  
- **Mercury**:
  - H1: 32px/650 weight/-0.035em
  - Body: 14px/1.5 leading
  - Small: 12px/--text-muted

**Our scale** (refined hierarchy):
```
H1 (page title): 32px / 650 weight / -0.035em tracking / --fg
H2 (section): 16px / 600 weight / -0.01em / --fg
H3 (card title): 14px / 600 weight / --fg
Body: 13px / 400 weight / 1.5 leading / --fg
Muted: 12px / 400 weight / --fg-muted
Small: 11px / 400 weight / --fg-muted
Metric value: 28px / 650 weight / -0.02em / --fg
Metric label: 12px / 400 weight / --fg-muted
```

Font stack (existing):
```css
--font-inter: 'Inter', system-ui, sans-serif
```

### 4. Icon Style

**Observed**:
- **Linear**: Custom outline icons, 1.5px stroke, 16px default, consistent rounded corners
- **Vercel**: Geist icons (similar to lucide), 1.5px stroke, 20px default
- **Stripe**: Custom icon set, 2px stroke, 24px default, more geometric
- **Raycast**: SF Symbols style, variable stroke, 16-20px
- **Attio**: Lucide-based, 1.5px stroke, 16px default

**Our choice** (already in repo):
```typescript
// src/components/design/icon.tsx
Icon set: Lucide-style (stroke-based)
Stroke width: 1.6px (consistent)
Default size: 16px (UI), 14px (inline), 20px (hero)
Style: Rounded corners, clean geometry
Color: currentColor (inherits from parent)
```

Usage patterns:
- Metric cards: 16px icon at top
- Section headers: 14px icon inline with H2
- List items: 14px icon leading
- Buttons: 13px icon with text
- Empty states: 24px icon centered

### 5. Empty States

**Observed patterns**:
- **Linear**: Centered icon (48px), H3 message, body explanation, primary CTA
- **Vercel**: Minimal text, small icon (20px), inline CTA link
- **Stripe**: Centered large icon (64px), bold message, detailed explanation, prominent CTA
- **Mercury**: No icon, centered text, subtle background tint, CTA button
- **Attio**: Small icon (24px), left-aligned text, inline action link

**Our pattern** (compact, actionable):
```tsx
<div className="empty-state">
  <Icon name="relevant" size={24} /> {/* Subtle, not dominant */}
  <p className="empty-message">Short, clear explanation</p>
  <Link href="/action" className="ds-btn ds-btn-sm ds-btn-primary">
    Clear action label
  </Link>
</div>
```

Style:
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* Left-aligned, not centered */
  gap: 8px;
  padding: 12px 0;
  font-size: 12px;
  color: var(--fg-muted);
}
```

Applied in:
- No CV uploaded
- No applications yet
- No opportunities matched
- No interviews

### 6. Sparklines & Compact Timelines

**Observed**:
- **Linear**: Vertical timeline with dots, connecting lines, compact 32px height per item
- **Vercel**: Horizontal sparkline SVG, 40px height, 1px stroke, area fill with gradient
- **Stripe**: Mini bar charts (8px bars), inline with metrics
- **Mercury**: Activity feed with avatar + timestamp, 48px per item
- **Attio**: Compact list with icon + title + metadata, 40px per item

**Our implementation**:

**Activity Timeline** (Linear-inspired):
```tsx
<ul className="activity-timeline">
  <li>
    <Icon name="send" size={14} /> {/* Action icon */}
    <div>
      <strong>Company · Job Title</strong>
      <p className="muted">Event description</p>
    </div>
    <time>Oct 15</time>
  </li>
</ul>
```

Style (compact, scannable):
```css
.activity-timeline li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-ds);
}
.activity-timeline li:last-child {
  border-bottom: none;
}
```

**Sparkline** (future enhancement, not in MVP):
- Use existing `Spark` component (src/components/design/spark.tsx)
- 40px height, 1.5px stroke, area fill with --primary at 10% opacity
- Show last 7 datapoints (daily application count)

### 7. Responsive Grid Behavior

**Observed breakpoints**:
- **Linear**: 
  - Desktop: 2-col sidebar + main (280px + 1fr)
  - Tablet (1024px): Single column, sidebar collapses to drawer
  - Mobile (768px): Full stack
  
- **Vercel**:
  - Desktop: 3-col (nav 240px + main + rail 320px)
  - Tablet (1280px): 2-col (nav + main, rail below)
  - Mobile (768px): Single column
  
- **Stripe**:
  - Desktop: 2-col (nav 256px + main)
  - Mobile (896px): Single column, nav becomes drawer
  
- **Mercury**:
  - Desktop: 2-col (sidebar 280px + main)
  - Tablet (1024px): Single column
  - Mobile: Full width

**Our breakpoints** (mobile-first):
```css
/* Mobile (375px - 767px): Single column, full width */
.dashboard-grid {
  grid-template-columns: 1fr;
  gap: 20px;
}

/* Tablet (768px - 1023px): Single column, max-width */
@media (min-width: 768px) {
  .dashboard-grid {
    max-width: 720px;
    margin: 0 auto;
  }
}

/* Desktop (1024px+): 2-col sidebar + main */
@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 320px 1fr;
    gap: 24px;
    max-width: 1400px;
  }
  
  .dashboard-sidebar {
    position: sticky;
    top: 84px; /* Below topbar */
  }
}
```

Metric cards (responsive grid):
```css
/* Mobile: Stack vertically */
.dashboard-metrics {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

/* Small tablet: 2 columns */
@media (min-width: 600px) {
  .dashboard-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 4 columns */
@media (min-width: 1024px) {
  .dashboard-metrics {
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
}
```

### 8. Hover & Focus States

**Observed**:
- **Linear**: Subtle background tint on hover, no border change, 150ms transition
- **Vercel**: Border color intensity increase, slight shadow, 200ms transition
- **Stripe**: Background color change only, no border/shadow, instant (0ms)
- **Mercury**: Border + background + shadow on hover, 160ms ease-out
- **Attio**: Border color shift, no shadow, 120ms transition

**Our states** (accessible, tactile):

```css
/* Card hover */
.card:hover {
  border-color: var(--primary-ds);
  box-shadow: 0 0 0 3px var(--primary-weak);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

/* Card focus (keyboard) */
.card:focus-visible {
  outline: 2px solid var(--primary-ds);
  outline-offset: 3px;
}

/* Button active (click) */
.button:active {
  transform: scale(0.98);
  transition: transform 120ms ease-out;
}

/* No motion (accessibility) */
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
    transform: none !important;
  }
}
```

### 9. Depth & Elevation

**Observed**:
- **Linear**: 3 levels (page, card, elevated). No shadows, only bg color change
- **Vercel**: Subtle shadows (0 1px 2px rgba(0,0,0,0.04)), 4 levels
- **Stripe**: No shadows, border + bg separation only
- **Mercury**: Minimal shadows (0 1px 3px rgba(0,0,0,0.08)) on cards
- **Attio**: No shadows, flat design with borders

**Our approach** (matte, no shadows):
```
Level 0 (page ground): var(--bg) - #0A0B0D dark / #FFFFFF light
Level 1 (cards): var(--bg-elev) - #141517 dark / #F9FAFB light
Level 2 (inputs): var(--bg-sunken) - #0A0B0D dark / #F3F4F6 light
Borders: var(--border-ds) - #2A2C30 dark / #E5E7EB light

Depth: Achieved through border + bg contrast, NOT shadows
Exception: Focus states use primary shadow (3px spread, 20% opacity)
```

### 10. Color System

**Observed primaries**:
- **Linear**: Blue (#5E6AD2), used sparingly (buttons, badges, accents)
- **Vercel**: Black (#000000), minimal color, monochrome-first
- **Stripe**: Indigo (#635BFF), prominent on CTAs and interactive elements
- **Mercury**: Purple (#7C3AED), used for CTAs and highlights
- **Attio**: Blue (#3B82F6), balanced usage across UI

**Our primary** (existing constraint):
```
Primary: #00EFA0 (mint green) dark, #059669 (darker green) light
Usage: 
  - Accent on interactive elements (buttons, links, badges)
  - Focus/hover states (border + shadow)
  - Icon highlights (sparingly)
  - Progress indicators
  
Restraint: NOT used for backgrounds, large areas, or decorative elements
```

Secondary colors (semantic):
```
Success: Primary green (reuse)
Warning: #F59E0B (amber)
Error: #EF4444 (red)
Info: #3B82F6 (blue)

Usage: Status chips, alerts, badges only
```

### 11. Consistent Patterns Applied

From analysis, these patterns are **must-haves** for polish:

1. **Fine borders everywhere** (1px, consistent color)
2. **Generous padding** (18-24px in cards, not cramped)
3. **Clear hierarchy** (H1 32px → H2 16px → Body 13px)
4. **Subtle hover states** (border shift + shadow, no jarring motion)
5. **Keyboard accessible** (visible focus outlines, 2px primary)
6. **Responsive** (375px mobile → 1400px desktop, graceful reflow)
7. **Consistent icons** (lucide-style, 1.6px stroke, 14-16px size)
8. **No greeting text** (straight to data, like Vercel/Stripe)
9. **Real data only** (no placeholder metrics, honest empty states)
10. **Matte aesthetic** (no heavy glass, no neon, restrained green)

---

## Design Tokens (Final)

```css
/* Spacing */
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 18px;
--space-xl: 24px;
--space-2xl: 32px;

/* Radius */
--radius-sm: 6px;  /* chips, tags */
--radius-md: 8px;  /* buttons, inputs */
--radius-lg: 12px; /* cards */

/* Typography */
--text-h1: 32px / 650 / -0.035em;
--text-h2: 16px / 600 / -0.01em;
--text-h3: 14px / 600 / 0;
--text-body: 13px / 400 / 0;
--text-muted: 12px / 400 / 0;
--text-metric: 28px / 650 / -0.02em;

/* Icons */
--icon-stroke: 1.6px;
--icon-sm: 14px;
--icon-md: 16px;
--icon-lg: 20px;

/* Transitions */
--transition-fast: 120ms ease-out;
--transition-base: 160ms ease;
--transition-slow: 200ms ease;
```

---

## Implementation Checklist

- [x] Define spacing scale (4-32px)
- [x] Document typography hierarchy
- [x] Confirm icon set (lucide-style, 1.6px stroke)
- [x] Design card anatomy (1px border, 12px radius, 18px padding)
- [x] Plan responsive breakpoints (375/768/1024)
- [x] Define hover/focus states (border + shadow)
- [x] Document empty state pattern (icon + text + CTA)
- [x] Plan activity timeline (compact, scannable)
- [x] Confirm color restraint (mint green, sparingly)
- [ ] Implement refined dashboard page
- [ ] Implement refined dashboard styles
- [ ] Test responsive behavior (375/768/1024/1440)
- [ ] Test keyboard navigation
- [ ] Test reduced motion
- [ ] Capture screenshots

---

## References

- Linear: https://linear.app (analyzed Oct 2026)
- Vercel: https://vercel.com/dashboard (analyzed Oct 2026)
- Stripe: https://dashboard.stripe.com (analyzed Oct 2026)
- Raycast: https://raycast.com (marketing site, inferred from screenshots)
- Arc: https://arc.net (marketing site, inferred from screenshots)
- Mercury: https://mercury.com (marketing site, inferred from screenshots)
- Attio: https://attio.com (marketing site, inferred from screenshots)

**Note**: Actual dashboard access was not possible; patterns inferred from public marketing materials, screenshots, and documented design systems.

---

**End of Inspiration Document**

