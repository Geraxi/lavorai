"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/design/icon";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

/**
 * Lead-magnet banner: rimanda al free-tier /optimize esistente che
 * già genera CV + cover letter in 60s con scoring ATS. Niente backend
 * nuovo da costruire — abbiamo già un audit gratuito funzionante.
 *
 * Posizione consigliata: dopo "How it works", prima di "Automation
 * Boundaries". Cattura l'utente che NON è ancora pronto a registrarsi
 * ma vuole vedere "se funziona davvero" senza commit.
 */
export function SectionLeadMagnet() {
  const t = useTranslations("leadMagnet");
  return (
    <section
      id="lead-magnet"
      className="relative border-t border-border/60 py-20 md:py-24"
    >
      <div className="container">
        <Reveal>
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              padding: "36px 32px",
              borderRadius: 16,
              border: "1px solid hsl(var(--primary) / 0.3)",
              background:
                "linear-gradient(135deg, hsl(var(--primary) / 0.08), transparent 70%), var(--bg-elev)",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 28,
            }}
            className="md:grid-cols-[1.4fr_1fr]"
          >
            <div>
              <p
                className="mono"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: "hsl(var(--primary))",
                  fontWeight: 500,
                }}
              >
                {t("eyebrow")}
              </p>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.2,
                  marginTop: 8,
                }}
              >
                {t("title")}
              </h2>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--fg-muted)",
                  marginTop: 12,
                }}
              >
                {t("subtitle")}
              </p>
              <Link
                href="/analizza-cv"
                onClick={() =>
                  trackEvent(AnalyticsEvent.LEAD_MAGNET_OPEN, {
                    source: "landing_banner",
                  })
                }
                className="ds-btn ds-btn-primary"
                style={{
                  marginTop: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  padding: "12px 22px",
                  fontWeight: 600,
                }}
              >
                <Icon name="sparkles" size={14} />
                {t("cta")}
              </Link>
            </div>

            <div
              style={{
                background: "var(--bg-sunken)",
                borderRadius: 12,
                padding: 20,
                border: "1px solid var(--border-ds)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--fg-subtle)",
                  fontWeight: 500,
                  marginBottom: 10,
                }}
              >
                {t("bulletsTitle")}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                {(["bullet1", "bullet2", "bullet3", "bullet4"] as const).map(
                  (k) => (
                    <li
                      key={k}
                      style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                    >
                      <span
                        style={{
                          color: "hsl(var(--primary))",
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </span>
                      <span>{t(k)}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
