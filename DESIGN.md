# LavorAI — design system (extracted from the cinematic hero)

## Application consent repair

The signed-in consent control follows `product-workspace.css` and existing Settings components: `SectionCard`, `SectionHead`, `SectionBody`, `ds-btn`, inherited body type and color tokens. Use the existing 4/12/16px spacing utilities and card radii. No new colors, type scale or animations. Keep the checkbox unchecked, the policy link visible, the action disabled until explicit selection, and errors/status announced. Question holds reuse `qa-notice` with a text action link that wraps on mobile.

Source of truth: `src/components/landing/cinematic-hero.{tsx,module.css}` (the hero is frozen; everything
below the fold extends it). Mode: landing = Persuade. The signed-in product palette is owned by
`src/components/design/product-workspace.css` (see `docs/PRODUCT_CONSISTENCY_CANDIDATE.md`); this file covers the landing only.

## Colour roles
| Role | Value | Use |
| --- | --- | --- |
| Ground / ink | `hsl(201 100% 13%)` ≈ `#002a42`; lower page `#092a3a` over the starlit sky texture (soft-light) | Page field. One dark world, no light sections. |
| Ink (text) | `#ffffff` | Headlines, running text on the field. |
| Ink secondary | `hsl(240 4% 66%)` (hero second line), `hsl(240 4% 74%)` (hero subtitle); lower page tints from the field: `#d2e0e8` lead, `#bcd0dc` notes | Second headline line, leads, notes. Never below 4.5:1 on the field. |
| Accent (mint) | `#00efa0` | The "AI" in the wordmark, the primary action's light, active/selected states, the one highlighted plan. Appears sparingly. |
| Accent soft | `#86d7bd` | Icons, checks, secondary accent on glass. |
| Paper | `#f5f6f3` / `#fafdfd` | Product mockups only (CV, cover letter, job cards). |
| Glass surface | `rgba(9,44,62,.72)` + `linear-gradient(150deg, rgba(255,255,255,.09), transparent 55%)`, edge `rgba(218,239,248,.22)` | Panels below the fold (brief: glassmorphism). |
| Product accent | Same mint `#00efa0` with midnight text `#010510` (restored brand palette, `product-workspace.css`) | Signed-in app reuses the landing mint; landing must not introduce a different green. |

## Type
- Display: **Instrument Serif 400** (`--font-landing-display`), tracking ≈ -0.025em (hero: -2.46px), leading 0.95–1.05.
  Hero 96 / 72 / 48px; section h2 `clamp(42px, 4.6vw, 66px)`; tile h2 `clamp(32px, 3.2vw, 46px)`; plan price 60px.
- Text: **Inter** (`--font-inter`), 400/500. Lead 16–18px / 1.6–1.7; body 13–15px; notes 11–12px.
- No eyebrows, no uppercase tracked labels, no index numbers, sentence case everywhere.
- Headlines: two lines max at every width (balance on).

## Spacing & layout
- Container `min(1160px, 100% - 80px)` → `100% - 48px` (≤850) → `100% - 32px` (≤650) → `100% - 24px` (≤380).
- Section padding 60–110px desktop, 40–70px phone; inside a section 14–56px.
- 12-col bento for features; neighbouring sections change composition (timeline → fan carousel → bento → video → plans → accordion).

## Radii
Pill `999px` for every action (hero glass buttons) · cards/panels `24px` · inner rows `16–18px` · chips `6px` · mockup paper `22px` in the carousel.

## Shadows & light
- Glass: `0 28px 64px rgba(0,9,18,.28), 0 6px 18px rgba(0,9,18,.18), inset 0 1px 0 rgba(255,255,255,.12)` (offset, soft).
- Hero glass ring: 1.4px gradient hairline mask (`.glass::before`), reused on `.button`.
- Glow (brief-pinned, used on a few things only): primary CTA, highlighted Pro plan, active carousel card, cursor light on the feature bento, final CTA field. Always offset downward (`0 10px 40px -8px rgba(0,239,160,.55)`), never a zero-offset halo on resting chips.

## Motion
- Tokens: `--ease-out: cubic-bezier(.23,1,.32,1)` (UI), `--ease-in-out: cubic-bezier(.77,0,.175,1)`; hero entrance = fade-rise 24px, 0.8s, 0.2s stagger.
- UI feedback 120–250ms on named properties; `:active { transform: scale(.97) }` on pressables; hover motion only under `(hover: hover) and (pointer: fine)`.
- Marketing moments: section reveal (opacity + 24px rise; transform/opacity only), scroll-linked timeline fill, fan carousel springs (`{duration: .5, bounce: .2}`, entrance bounce .3).
- `prefers-reduced-motion`: no travel, no springs, no loops; values and states appear immediately.
