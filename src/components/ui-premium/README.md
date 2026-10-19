# ui-premium

Shared dark-first design system for the signed-in app (dashboard redesign, 2026-10).

- `premium.css` – tokens (`--pm-*`, scoped to `.lavorai-app-shell` / `.pm-scope`) and
  shared components: `pm-card`, `pm-kpi`, `pm-pill`/`pm-dot` (`tone-green|amber|red|neutral`),
  `pm-list`/`pm-row`, `pm-timeline`, `pm-statusbar`, `pm-legend`, `pm-trend`, `pm-spark`,
  `pm-empty`, `pm-btn-primary`, `pm-btn-ghost`.
- `shell.css` – sidebar, top bar, mobile header/bottom nav, app-wide notices; dark palette
  overrides for legacy `--bg`/`--fg`/`--primary` variables.
- React: `Card`/`CardHead`, `KpiCard`, `Pill`/`Dot`, `Avatar`, `EmptyState`, `Notice`,
  `StatusBar`, `Sparkline`, `TrendChart`/`TrendLegend` (hand-rolled SVG), `navIcon`.
- `tone.ts` – `STAGE_ORDER` / `STAGE_TONE` for application journey stages.

Rules: green only for primary CTAs, status dots and evidence; hairline borders; no glass,
no glow. Every number shown must come from `src/lib/dashboard-metrics-shared.ts`.
