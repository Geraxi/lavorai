import Link from "next/link";
import type { AutoApplyReadiness } from "@/lib/auto-apply-readiness";
import { Icon } from "@/components/design/icon";

export function AutoApplyReadinessCard({ readiness }: { readiness: AutoApplyReadiness }) {
  const color = readiness.tone === "ready" ? "#2ED69A" : readiness.tone === "paused" ? "#A7AAB6" : "#F3B541";
  return (
    <section className="fit-card dg-side-card" aria-label="Stato auto-apply" style={{ borderColor: `color-mix(in srgb, ${color} 34%, var(--border-ds))` }}>
      <div className="fit-card-head" style={{ alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color, fontSize: 11, fontWeight: 750, letterSpacing: ".04em", textTransform: "uppercase" }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: color, boxShadow: `0 0 10px ${color}` }} />
            {readiness.eyebrow}
          </div>
          <div style={{ color: "var(--fg)", fontWeight: 700, fontSize: 13.5, marginTop: 7 }}>{readiness.title}</div>
          <p style={{ margin: "5px 0 0", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.45 }}>{readiness.detail}</p>
        </div>
      </div>
      <Link href={readiness.href} className="fit-link" style={{ display: "inline-flex", marginTop: 10, fontSize: 12.5 }}>
        {readiness.cta} <Icon name="arrow-right" size={12} />
      </Link>
    </section>
  );
}
