"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import { Icon, type IconName } from "@/components/design/icon";
import {
  trackEvent,
  observeOnce,
  AnalyticsEvent,
} from "@/lib/analytics";
import { TRUST_CLAIMS } from "@/lib/marketing-content";

const TRUST_CLAIMS_EN: typeof TRUST_CLAIMS = [
  { icon: "shield", title: "European database, GDPR-first", body: "The primary database is hosted by Neon in Frankfurt. Every provider and processing purpose is listed in the privacy policy." },
  { icon: "lock", title: "AI response storage disabled", body: "Requests that tailor CVs and letters use OpenAI with response storage disabled. Text is sent only when needed to produce the requested result." },
  { icon: "check", title: "Explicit activation", body: "Auto-apply starts only after you enable it. No hidden submission and no silent opt-in." },
  { icon: "eye", title: "You stay in control", body: "Pause anytime, block companies and set match thresholds. See every application in your live dashboard." },
  { icon: "download", title: "Complete one-click export", body: "Download your profile, CV and application history as JSON from Settings, without waiting for support." },
  { icon: "trash", title: "Complete one-click deletion", body: "Delete your account, CV, files, queues and open applications directly from Settings." },
];

/**
 * Trust block: GDPR + encryption + consent + control + export + delete.
 *
 * Coerente con /privacy ma riassuntivo, non legalese. Posizionato dopo
 * "Automation Boundaries" per stackare risposte alle obiezioni di
 * sicurezza prima del pricing.
 */
export function SectionTrustBlock() {
  const t = useTranslations("trustSection");
  const locale = useLocale();
  const claims = locale === "en" ? TRUST_CLAIMS_EN : TRUST_CLAIMS;
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
          {claims.map((claim, i) => (
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
