import Link from "next/link";
import { FEATURE_LABELS, TIERS, type PremiumFeature } from "@/lib/billing";

/**
 * In-page paywall component. Mostrato come content principale della
 * pagina quando un utente free/pro tenta di accedere a una feature
 * Pro+. NON un dialog modale — è la pagina che sta visitando, così
 * vede chiaramente cosa sta per sbloccare invece di un popup.
 */
export function PremiumGate({
  feature,
  isLoggedIn,
}: {
  feature: PremiumFeature;
  isLoggedIn: boolean;
}) {
  const meta = FEATURE_LABELS[feature];
  const tier = TIERS.pro_plus;

  return (
    <div
      style={{
        maxWidth: 760,
        margin: "60px auto",
        padding: "0 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "5px 11px",
          borderRadius: 999,
          background: "hsl(var(--primary) / 0.12)",
          color: "hsl(var(--primary))",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        🔒 Pro+ · {tier.priceDisplay}
        {tier.priceSuffix}
      </div>

      <h1
        style={{
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          margin: "0 0 14px",
        }}
      >
        {meta.name}
      </h1>

      <p
        style={{
          fontSize: 16,
          color: "var(--fg-muted)",
          lineHeight: 1.6,
          margin: "0 auto 32px",
          maxWidth: 600,
        }}
      >
        {meta.blurb}
      </p>

      <div
        style={{
          padding: "26px 28px",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, hsl(var(--primary) / 0.10), hsl(var(--primary) / 0.02) 60%)",
          border: "1px solid hsl(var(--primary) / 0.35)",
          textAlign: "left",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "hsl(var(--primary))",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Cosa sblocchi con Pro+
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
          className="pg-feature-list"
        >
          {tier.features.map((f, i) => (
            <li
              key={i}
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                display: "flex",
                gap: 8,
                color: "var(--fg)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  color: "hsl(var(--primary))",
                  fontWeight: 700,
                  marginTop: 1,
                }}
              >
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <style>{`
          @media (max-width: 600px) {
            .pg-feature-list { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link
          href={isLoggedIn ? "/pricing?upgrade=pro_plus" : "/signup?plan=pro_plus"}
          className="ds-btn ds-btn-primary"
          style={{ padding: "13px 26px", fontSize: 14.5 }}
        >
          Sblocca Pro+ a €39.99/mese →
        </Link>
        <Link
          href="/pricing"
          className="ds-btn"
          style={{ padding: "13px 22px", fontSize: 14 }}
        >
          Confronta i piani
        </Link>
      </div>

      <p
        style={{
          marginTop: 18,
          fontSize: 11.5,
          color: "var(--fg-subtle)",
          lineHeight: 1.55,
        }}
      >
        Cancelli quando vuoi · IVA inclusa · Pagamento via Stripe
      </p>
    </div>
  );
}
