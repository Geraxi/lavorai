"use client";

import { useRef, useState } from "react";

/**
 * Overlay hover per i grafici SVG dell'admin (server-rendered): si posa
 * sopra il grafico (il genitore deve essere `position: relative`), mappa la
 * posizione del mouse a un indice (mode "x") o a un segmento (mode "donut")
 * e mostra un tooltip con etichetta e valori. Nessuna dipendenza.
 */
export interface HoverRow { name: string; value: string | number; color?: string }
export interface HoverItem { label: string; rows: HoverRow[] }

export function ChartHover({
  items,
  mode = "x",
  padLeftFrac = 0,
  padRightFrac = 0,
  /** Per "donut": frazioni cumulative dei segmenti (0..1) e raggio interno/esterno in frazione del lato. */
  donut,
  guide = true,
}: {
  items: HoverItem[];
  mode?: "x" | "donut";
  padLeftFrac?: number;
  padRightFrac?: number;
  donut?: { fractions: number[]; innerFrac: number; outerFrac: number };
  guide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number; guideX: number } | null>(null);
  const n = items.length;
  if (n === 0) return null;

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (mode === "donut" && donut) {
      const cx = r.width / 2, cy = r.height / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy) / Math.min(r.width, r.height);
      if (dist < donut.innerFrac || dist > donut.outerFrac) { setHover(null); return; }
      // angolo da ore 12, in senso orario (il donut è ruotato -90°)
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const frac = ang / (Math.PI * 2);
      let acc = 0, idx = -1;
      for (let k = 0; k < donut.fractions.length; k++) { acc += donut.fractions[k]; if (frac <= acc) { idx = k; break; } }
      if (idx < 0) { setHover(null); return; }
      setHover({ i: idx, x, y, guideX: -1 });
      return;
    }
    const left = r.width * padLeftFrac;
    const inner = r.width * (1 - padLeftFrac - padRightFrac);
    const frac = Math.min(1, Math.max(0, (x - left) / Math.max(1, inner)));
    const i = n === 1 ? 0 : Math.round(frac * (n - 1));
    const guideX = left + (n === 1 ? inner / 2 : (i / (n - 1)) * inner);
    setHover({ i, x, y, guideX });
  };

  const item = hover ? items[hover.i] : null;
  const width = ref.current?.getBoundingClientRect().width ?? 0;
  const tipLeft = hover ? (hover.x > width * 0.6 ? undefined : hover.x + 12) : undefined;
  const tipRight = hover && hover.x > width * 0.6 ? width - hover.x + 12 : undefined;

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ position: "absolute", inset: 0, cursor: "crosshair" }}>
      {hover && item && (
        <>
          {guide && mode === "x" && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: hover.guideX, width: 1, background: "var(--fg-subtle)", opacity: 0.55, pointerEvents: "none" }} />
          )}
          <div
            role="tooltip"
            style={{
              position: "absolute",
              top: Math.max(4, Math.min(hover.y - 10, 9999)),
              left: tipLeft,
              right: tipRight,
              minWidth: 120,
              maxWidth: 240,
              padding: "8px 10px",
              borderRadius: 10,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
              fontSize: 11.5,
              lineHeight: 1.45,
              color: "var(--fg)",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: item.rows.length ? 4 : 0, color: "var(--fg-muted)", fontSize: 11 }}>{item.label}</div>
            {item.rows.map((row) => (
              <div key={row.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
                  {row.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: row.color }} />}
                  {row.name}
                </span>
                <span className="adm-num" style={{ fontWeight: 700 }}>{typeof row.value === "number" ? row.value.toLocaleString("it-IT") : row.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
