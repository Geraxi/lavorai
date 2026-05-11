"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import { Icon, type IconName } from "@/components/design/icon";
import {
  trackEvent,
  observeOnce,
  AnalyticsEvent,
} from "@/lib/analytics";
import { TRUST_CLAIMS } from "@/lib/marketing-content";

/**
 * Trust block: GDPR + encryption + consent + control + export + delete.
 *
 * Coerente con /privacy ma riassuntivo, non legalese. Posizionato dopo
 * "Automation Boundaries" per stackare risposte alle obiezioni di
 * sicurezza prima del pricing.
 */
export function SectionTrustBlock() {
  const t = useTranslations("trustSection");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return observeOnce(ref.current, () =>
      trackEvent(AnalyticsEvent.TRUST_SECTION_VIEW),
    );
  }, []);

  return (
    <section
      ref={ref}
      id="trust"
      className="relative border-t border-border/60 py-24 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, transparent, var(--bg-elev) 30%, transparent)",
      }}
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.32em",
              color: "hsl(var(--primary) / 0.8)",
              fontWeight: 500,
            }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
          {TRUST_CLAIMS.map((claim, i) => (
            <Reveal key={claim.title} delay={i * 0.04}>
              <TrustClaim claim={claim} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-10 flex justify-center">
          <Link
            href="/privacy"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("readPolicy")} →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function TrustClaim({
  claim,
}: {
  claim: (typeof TRUST_CLAIMS)[number];
}) {
  // Map dei nostri icon name custom → IconName supportato
  const iconMap: Record<typeof claim.icon, IconName> = {
    shield: "target",
    lock: "target",
    trash: "x",
    download: "arrow-up-right",
    eye: "sparkles",
    check: "check",
  };
  return (
    <div
      style={{
        height: "100%",
        padding: 22,
        borderRadius: 12,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "hsl(var(--primary) / 0.12)",
          color: "hsl(var(--primary))",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={iconMap[claim.icon]} size={16} />
      </div>
      <h3
        style={{
          fontSize: 15.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginTop: 4,
        }}
      >
        {claim.title}
      </h3>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--fg-muted)",
          margin: 0,
        }}
      >
        {claim.body}
      </p>
    </div>
  );
}
