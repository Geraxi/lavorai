import { ImageResponse } from "next/og";

/**
 * Open Graph image dinamica per LavorAI.
 *
 * Next.js auto-monta questo file su /opengraph-image (1200x630, PNG) e
 * inietta automaticamente og:image + twitter:image in tutte le pagine
 * che non sovrascrivono i metadata. Niente file PNG statico da
 * mantenere — la grafica è codice + font.
 *
 * Anteprima previews:
 *   https://www.opengraph.xyz/?url=https%3A%2F%2Flavorai.it
 *   https://cards-dev.twitter.com/validator
 */

export const runtime = "edge";
export const alt =
  "LavorAI — il copilota italiano per la ricerca del lavoro";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#010510",
          color: "#FFFFFF",
          padding: "72px 80px",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Atmospheric glow verde — riprende il theme del sito */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -160,
            width: 720,
            height: 720,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(22,163,74,0.45) 0%, rgba(22,163,74,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -240,
            left: -160,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(22,163,74,0.25) 0%, rgba(22,163,74,0) 70%)",
            display: "flex",
          }}
        />

        {/* Logo lock-up */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#16A34A",
              color: "#001a0d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            L
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            <span style={{ color: "#FFFFFF" }}>Lavor</span>
            <span style={{ color: "#16A34A" }}>AI</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 56,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              color: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Il copilota italiano</span>
            <span>
              per la <span style={{ color: "#16A34A" }}>ricerca del lavoro</span>.
            </span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 28,
              fontWeight: 400,
              lineHeight: 1.4,
              color: "rgba(255,255,255,0.7)",
              maxWidth: 920,
              display: "flex",
            }}
          >
            Auto-apply su Greenhouse, Lever, Workable. CV ottimizzato e
            cover letter AI per ogni annuncio.
          </div>
        </div>

        {/* Bottom trust row */}
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 28,
              fontSize: 20,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#16A34A", fontSize: 22 }}>✓</span>
              <span>GDPR-first</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#16A34A", fontSize: 22 }}>✓</span>
              <span>Server EU</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#16A34A", fontSize: 22 }}>✓</span>
              <span>Pausa quando vuoi</span>
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.45)",
              fontFamily: "monospace",
            }}
          >
            lavorai.it
          </div>
        </div>
      </div>
    ),
    size,
  );
}
