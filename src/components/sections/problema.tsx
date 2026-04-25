"use client";

import { Reveal } from "@/components/reveal";

/**
 * Sezione "Problema → Soluzione" — band compatta, due colonne.
 * Niente lista di 3 punti gonfia: solo confronto secco.
 */
export function SectionProblema() {
  return (
    <section
      id="problema"
      className="relative border-t border-border/60 py-24 md:py-28"
    >
      <div className="container">
        <Reveal>
          <div
            className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:gap-8"
            style={{ alignItems: "stretch" }}
          >
            {/* Problema */}
            <div
              style={{
                padding: 28,
                borderRadius: 16,
                border: "1px solid var(--border-ds)",
                background: "var(--bg-elev)",
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "var(--fg-muted)",
                  fontWeight: 500,
                }}
              >
                Il vecchio modo
              </div>
              <h3
                style={{
                  marginTop: 12,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--fg-muted)",
                  textDecoration: "line-through",
                  textDecorationColor: "var(--fg-subtle)",
                  textDecorationThickness: 1.5,
                }}
              >
                Candidarsi a mano
              </h3>
              <ul
                style={{
                  marginTop: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 14,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                <li>— Stesse risposte in form diversi, per ore</li>
                <li>— Cover letter generiche che nessuno legge</li>
                <li>— Settimane di silenzio, zero risposte</li>
                <li>— ATS che filtra il CV prima dell&apos;umano</li>
              </ul>
            </div>

            {/* Soluzione */}
            <div
              style={{
                padding: 28,
                borderRadius: 16,
                border: "1px solid hsl(var(--primary)/0.4)",
                background:
                  "linear-gradient(180deg, hsl(var(--primary)/0.08), transparent 95%)",
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "hsl(var(--primary))",
                  fontWeight: 500,
                }}
              >
                Con LavorAI
              </div>
              <h3
                style={{
                  marginTop: 12,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--fg)",
                }}
              >
                Auto-apply in background
              </h3>
              <ul
                style={{
                  marginTop: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 14,
                  color: "var(--fg)",
                  lineHeight: 1.5,
                }}
              >
                <li>
                  <span className="text-primary">✓</span> CV cucito su misura
                  per ogni annuncio
                </li>
                <li>
                  <span className="text-primary">✓</span> Cover letter in
                  italiano nativo, mai generica
                </li>
                <li>
                  <span className="text-primary">✓</span> Submit diretto sul
                  form ATS — passa il filtro
                </li>
                <li>
                  <span className="text-primary">✓</span> Ricevi solo gli inviti
                  ai colloqui
                </li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
