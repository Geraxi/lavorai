import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * KPI card: muted uppercase label with icon chip, large tabular number,
 * one-line definition, optional visual (sparkline) on the right.
 */
export function KpiCard({
  id,
  label,
  value,
  hint,
  href,
  icon: KpiIcon,
  visual,
  locale = "it",
}: {
  id: string;
  label: string;
  value: number;
  hint: string;
  href?: string;
  icon: LucideIcon;
  visual?: ReactNode;
  locale?: string;
}) {
  const body = (
    <>
      <div className="pm-kpi-top">
        <span className="pm-chip-icon"><KpiIcon size={14} strokeWidth={1.75} aria-hidden /></span>
        <span className="pm-kpi-label">{label}</span>
      </div>
      <div className="pm-kpi-body">
        <div className="pm-kpi-value">{value.toLocaleString(locale === "en" ? "en-GB" : "it-IT")}</div>
        {visual}
      </div>
      <div className="pm-kpi-hint">{hint}</div>
    </>
  );
  return href ? (
    <Link href={href} className="pm-kpi" data-kpi={id}>{body}</Link>
  ) : (
    <div className="pm-kpi" data-kpi={id}>{body}</div>
  );
}
