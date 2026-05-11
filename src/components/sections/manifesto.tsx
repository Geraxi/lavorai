"use client";

import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";

/**
 * Manifesto / founder note — "perché esistiamo".
 *
 * Layout deliberatamente diverso da tutto il resto del sito: niente
 * card, niente colonne, niente CTA. Solo testo, in font serif (system
 * stack Georgia + fallback), allineato a sinistra, max-width stretto
 * per ritmo di lettura. Si firma "Umberto, founder".
 *
 * Funziona perché:
 *   - Differenzia visivamente (serif vs sans-serif del resto)
 *   - Numerica specifica (8 mesi, 312, 6) crea credibilità
 *   - Niente "AI", niente "platform" — solo storia personale
 *   - Italiani leggono "scrivermi una mail" come invito, non form
 */
export function SectionManifesto() {
  const t = useTranslations("manifesto");

  return (
    <section
      className="relative border-t border-border/60"
      style={{
        paddingTop: 120,
        paddingBottom: 120,
        background:
          "linear-gradient(180deg, transparent, var(--bg-elev) 30%, var(--bg-elev) 70%, transparent)",
      }}
    >
      <div
        className="container"
        style={{
          maxWidth: 720,
        }}
      >
        <Reveal>
          <p
            className="mono"
            style={{
              fontSize: 11.5,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "var(--fg-subtle)",
              fontWeight: 500,
              marginBottom: 32,
              textAlign: "center",
            }}
          >
            {t("eyebrow")}
          </p>
        </Reveal>

        {/* Manifesto body. Font serif system stack — Georgia su macOS è
            elegantissimo, Source Serif su moderni Chrome OS, fallback
            su Times New Roman ovunque. Niente font esterno da caricare. */}
        <div
          style={{
            fontFamily:
              "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif",
            fontSize: "clamp(1.15rem, 1.6vw, 1.45rem)",
            lineHeight: 1.7,
            letterSpacing: "-0.005em",
            color: "var(--fg)",
            display: "flex",
            flexDirection: "column",
            gap: "1.2em",
          }}
        >
          <Reveal delay={0.1}>
            <p
              style={{
                margin: 0,
                fontStyle: "italic",
                fontSize: "clamp(1.4rem, 2.2vw, 2rem)",
                letterSpacing: "-0.015em",
                lineHeight: 1.4,
                color: "var(--fg)",
                fontWeight: 400,
              }}
            >
              {t("opening")}
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <p style={{ margin: 0 }}>{t("p1")}</p>
          </Reveal>

          <Reveal delay={0.26}>
            <p style={{ margin: 0 }}>
              {t.rich("p2", {
                emph: (chunks) => (
                  <em
                    style={{
                      fontStyle: "italic",
                      color: "var(--fg)",
                    }}
                  >
                    {chunks}
                  </em>
                ),
              })}
            </p>
          </Reveal>

          <Reveal delay={0.34}>
            <p style={{ margin: 0 }}>{t("p3")}</p>
          </Reveal>

          <Reveal delay={0.42}>
            <p style={{ margin: 0 }}>{t("p4")}</p>
          </Reveal>

          {/* Signature block — separato, più piccolo, mono-font per
              l'attribuzione. Aggiunge artefatto "scritto a mano" senza
              skeumorfismo eccessivo. */}
          <Reveal delay={0.5}>
            <div
              style={{
                marginTop: 24,
                paddingTop: 24,
                borderTop: "1px solid var(--border-ds)",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
              }}
            >
              <div
                style={{
                  fontFamily:
                    "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "var(--fg)",
                  marginBottom: 4,
                }}
              >
                {t("signatureName")}
              </div>
              <div className="mono" style={{ fontSize: 12 }}>
                {t("signatureRole")}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
