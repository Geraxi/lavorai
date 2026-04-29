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
                <li>— 2 ore per candidarti a 5 posizioni. Ogni giorno.</li>
                <li>— Cover letter copia-incolla che i recruiter riconoscono subito</li>
                <li>— Mandi 30 candidature, ricevi 2 risposte. Se va bene.</li>
                <li>— L&apos;ATS scarta il tuo CV prima che un umano lo veda</li>
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
                  <span className="text-primary">✓</span> CV riscritto per ogni
                  annuncio in 45 secondi
                </li>
                <li>
                  <span className="text-primary">✓</span> Cover letter che cita
                  il nome dell&apos;azienda e il ruolo
                </li>
                <li>
                  <span className="text-primary">✓</span> LavorAI compila il
                  form ATS per te — zero copia-incolla
                </li>
                <li>
                  <span className="text-primary">✓</span> La tua unica attività:
                  accettare i colloqui
                </li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
