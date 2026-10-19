import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { FEATURE_LABELS, TIERS, type PremiumFeature } from "@/lib/billing";
import "@/components/ui-premium/premium-gate.css";

/** "[icon] Text {soon}" (pricing copy) → plain text + "in arrivo" flag. */
export function parseFeature(raw: string): { text: string; soon: boolean } {
  const soon = /\{soon\}/i.test(raw);
  const text = raw.replace(/^\s*\[[a-z-]+\]\s*/i, "").replace(/\s*\{soon\}\s*/gi, " ").trim();
  return { text, soon };
}

/**
 * In-page paywall for Pro+ features: a matte card inside the page, not a
 * modal, so the user sees what the feature is. Green only on the CTA.
 */
export function PremiumGate({
  feature,
  isLoggedIn,
  compact = false,
}: {
  feature: PremiumFeature;
  isLoggedIn: boolean;
  compact?: boolean;
}) {
  const meta = FEATURE_LABELS[feature];
  const tier = TIERS.pro_plus;
  // Italian formatting: "€39,99/mese" (catalog stores "€39.99" + "/ mese").
  const price = `${tier.priceDisplay.replace(/(\d)\.(\d{2})\b/, "$1,$2")}${tier.priceSuffix.replace(/\/\s+/, "/")}`;
  return (
    <section className={`pm-card pm-gate${compact ? " is-compact" : ""}`} aria-labelledby={`gate-${feature}`}>
      <div className="pm-gate-head">
        <span className="pm-gate-badge"><Lock size={12} aria-hidden /> Pro+ · {price}</span>
        <h2 id={`gate-${feature}`}>{meta.name}</h2>
        <p className="pm-muted">{meta.blurb}</p>
      </div>
      <div className="pm-gate-body">
        <span className="pm-eyebrow">Cosa include Pro+</span>
        <ul className="pm-gate-list">
          {tier.features.map((raw, i) => {
            const f = parseFeature(raw);
            return (
              <li key={i}>
                <Check size={14} strokeWidth={2} aria-hidden />
                <span>{f.text}{f.soon && <span className="pm-gate-soon">in arrivo</span>}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pm-gate-foot">
        <div className="pm-gate-actions">
          <Link href={isLoggedIn ? "/pricing?upgrade=pro_plus" : "/signup?plan=pro_plus"} className="pm-btn-primary">
            Passa a Pro+ <ArrowRight size={14} aria-hidden />
          </Link>
          <Link href="/pricing" className="pm-btn-ghost">Confronta i piani</Link>
        </div>
        <p className="pm-muted">Disdici quando vuoi · IVA inclusa · Pagamento via Stripe</p>
      </div>
    </section>
  );
}
