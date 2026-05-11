import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Icon } from "@/components/design/icon";

export const metadata: Metadata = {
  title: "Analizza il tuo CV gratis · ATS score + suggerimenti",
  description:
    "Carica il CV e un annuncio. In 60 secondi ricevi: ATS score (su 100), CV ottimizzato in DOCX, cover letter scritta per quell'annuncio, 3-5 suggerimenti concreti.",
};

/**
 * /analizza-cv — dedicated lead-magnet landing.
 *
 * Wrap pulito attorno all'esistente `/optimize` (che è il form audit
 * funzionante). Una landing dedicata serve a:
 *   - SEO con keyword "analizza CV gratis" / "ATS score italiano"
 *   - Paid acquisition: bounce a form in 1 step invece che landing → form
 *   - Conversion: positioning chiaro "free utility" senza account
 *
 * Il flow reale di analisi rimane in /optimize. Qui mostriamo solo
 * il valore + CTA prominente.
 */
export default async function AnalizzaCvLanding() {
  const t = await getTranslations("analizzaCvPage");

  const bullets: Array<{ icon: "check" | "zap" | "sparkles" | "target"; text: string }> = [
    { icon: "target", text: t("bullet1") },
    { icon: "sparkles", text: t("bullet2") },
    { icon: "zap", text: t("bullet3") },
    { icon: "check", text: t("bullet4") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* Hero gradient consistente con la homepage */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 30%, hsl(var(--primary)/0.18), transparent 65%)",
            }}
          />
          <div
            aria-hidden
            className="grid-bg pointer-events-none absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          />

          <div
            className="relative z-10"
            style={{
              maxWidth: 980,
              margin: "0 auto",
              padding: "80px 32px 64px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 12px",
                borderRadius: 999,
                background: "hsl(var(--primary)/0.1)",
                border: "1px solid hsl(var(--primary)/0.3)",
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "hsl(var(--primary))",
                  boxShadow: "0 0 8px hsl(var(--primary)/0.6)",
                }}
              />
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "hsl(var(--primary))",
                  textTransform: "uppercase",
                }}
              >
                {t("badge")}
              </span>
            </div>

            <h1
              className="text-balance"
              style={{
                fontSize: "clamp(2.25rem, 4.5vw, 4rem)",
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
              }}
            >
              {t("title1")}{" "}
              <span className="text-gradient-accent">{t("title2")}</span>
            </h1>

            <p
              className="mx-auto mt-6 max-w-2xl text-balance text-muted-foreground"
              style={{
                fontSize: "clamp(1rem, 1.2vw, 1.2rem)",
                lineHeight: 1.55,
              }}
            >
              {t("subtitle")}
            </p>

            <div
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <Link
                href="/optimize"
                className="ds-btn ds-btn-primary"
                style={{
                  minHeight: 56,
                  paddingLeft: 28,
                  paddingRight: 28,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                <Icon name="sparkles" size={15} />
                {t("cta")}
              </Link>
              <Link
                href="/signup"
                className="ds-btn"
                style={{
                  minHeight: 56,
                  paddingLeft: 24,
                  paddingRight: 24,
                  fontSize: 15,
                }}
              >
                {t("ctaSecondary")} →
              </Link>
            </div>

            <p
              style={{
                fontSize: 12.5,
                color: "var(--fg-muted)",
                marginTop: 16,
              }}
            >
              {t("caption")}
            </p>
          </div>
        </section>

        {/* What you get */}
        <section
          className="relative border-t border-border/60 py-20 md:py-24"
          style={{ background: "var(--bg-sunken)" }}
        >
          <div className="container">
            <div
              style={{
                maxWidth: 880,
                margin: "0 auto",
                textAlign: "center",
              }}
            >
              <p
                className="mono"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: "hsl(var(--primary))",
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                {t("getEyebrow")}
              </p>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.2,
                }}
              >
                {t("getTitle")}
              </h2>
            </div>

            <div
              style={{
                maxWidth: 980,
                margin: "48px auto 0",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {bullets.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: 22,
                    borderRadius: 12,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-ds)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "hsl(var(--primary)/0.15)",
                      color: "hsl(var(--primary))",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={b.icon} size={16} />
                  </div>
                  <p
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.5,
                      color: "var(--fg)",
                      margin: 0,
                    }}
                  >
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works (3 step lean) */}
        <section className="relative border-t border-border/60 py-20 md:py-24">
          <div className="container">
            <div
              style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}
            >
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.2,
                }}
              >
                {t("howTitle")}
              </h2>
              <p
                style={{
                  fontSize: 15.5,
                  color: "var(--fg-muted)",
                  marginTop: 14,
                  maxWidth: 600,
                  marginLeft: "auto",
                  marginRight: "auto",
                  lineHeight: 1.55,
                }}
              >
                {t("howBody")}
              </p>
            </div>

            <ol
              style={{
                maxWidth: 720,
                margin: "44px auto 0",
                listStyle: "none",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {(["step1", "step2", "step3"] as const).map((k, i) => (
                <li
                  key={k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 16,
                    padding: "18px 22px",
                    borderRadius: 12,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-ds)",
                    alignItems: "center",
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      background: "hsl(var(--primary)/0.12)",
                      color: "hsl(var(--primary))",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      color: "var(--fg)",
                    }}
                  >
                    {t(k)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative border-t border-border/60 py-20 md:py-24">
          <div className="container">
            <div
              style={{
                maxWidth: 720,
                margin: "0 auto",
                textAlign: "center",
                padding: "36px 28px",
                borderRadius: 18,
                background:
                  "linear-gradient(135deg, hsl(var(--primary)/0.12), transparent 70%), var(--bg-elev)",
                border: "1px solid hsl(var(--primary)/0.25)",
              }}
            >
              <h2
                style={{
                  fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.022em",
                  lineHeight: 1.25,
                }}
              >
                {t("finalTitle")}
              </h2>
              <Link
                href="/optimize"
                className="ds-btn ds-btn-primary"
                style={{
                  marginTop: 24,
                  minHeight: 56,
                  paddingLeft: 28,
                  paddingRight: 28,
                  fontSize: 16,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="sparkles" size={15} />
                {t("cta")}
              </Link>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--fg-muted)",
                  marginTop: 14,
                }}
              >
                {t("caption")}
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
