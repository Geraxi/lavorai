import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { LiveStatsBadge } from "@/components/live-stats-badge";

/**
 * SEO landing dedicata alla keyword "auto candidatura lavoro" e simili.
 * Match search intent commerciale (chi cerca un TOOL, non info generica).
 * H1 + meta title contengono la keyword esatta; H2 coprono keyword
 * secondarie ("candidarsi automaticamente", "software candidature automatiche").
 *
 * NON è un duplicato della homepage: risponde in modo diretto alla query
 * dell'utente, senza wordplay, con CTA immediato al signup.
 */
export const metadata: Metadata = {
  title:
    "Auto candidatura lavoro: invia CV automaticamente | LavorAI",
  description:
    "Cerchi un software per candidarti automaticamente ai lavori? LavorAI invia CV + lettera motivazionale AI a 50 offerte/mese al posto tuo. 3 candidature gratis, no carta. Provalo in 2 minuti.",
  alternates: { canonical: "/auto-candidatura" },
  openGraph: {
    title: "Auto candidatura lavoro — LavorAI",
    description:
      "Il primo software italiano che invia CV in automatico a 50 lavori al mese. 3 candidature gratis, senza carta.",
    url: "/auto-candidatura",
  },
};

export default function AutoCandidaturaPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main
        className="flex-1"
        style={{ background: "#010510", color: "#fff" }}
      >
        {/* ============ HERO ============ */}
        <section
          style={{
            padding: "80px 24px 60px",
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          <LiveStatsBadge variant="hero" />
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              marginTop: 24,
              marginBottom: 20,
            }}
          >
            Auto candidatura lavoro:{" "}
            <span
              style={{
                color: "hsl(var(--primary))",
                textShadow: "0 0 40px hsl(var(--primary)/0.35)",
              }}
            >
              invia CV automaticamente
            </span>{" "}
            a 50 lavori al mese.
          </h1>
          <p
            style={{
              fontSize: "clamp(1rem, 1.15vw, 1.15rem)",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.75)",
              maxWidth: 640,
              marginBottom: 32,
            }}
          >
            LavorAI è il software italiano che <strong>trova le offerte
            giuste, riscrive il CV per ognuna e invia le candidature al
            posto tuo</strong> su Greenhouse, Lever, LinkedIn, Adzuna e
            altre 200+ fonti. Tu torni a fare colloqui, non a riempire
            form.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Link
              href="/signup"
              className="ds-btn"
              style={{
                background: "hsl(var(--primary))",
                color: "#001a0d",
                padding: "14px 28px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                minHeight: 52,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Attiva auto-apply — gratis
            </Link>
            <Link
              href="/pricing"
              style={{
                color: "rgba(255,255,255,0.85)",
                textDecoration: "underline",
                fontSize: 15,
                padding: "14px 8px",
              }}
            >
              Vedi prezzi
            </Link>
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "rgba(255,255,255,0.55)",
              marginTop: 14,
            }}
          >
            ✓ 3 candidature/mese gratis · ✓ Nessuna carta richiesta · ✓ Attivazione in 2 minuti
          </p>
        </section>

        {/* ============ SEO H2 SECTION 1 ============ */}
        <section
          style={{
            padding: "60px 24px",
            maxWidth: 900,
            margin: "0 auto",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 20,
            }}
          >
            Come candidarsi automaticamente ai lavori
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 20,
            }}
          >
            Il flusso è pensato per essere zero-friction: colleghi una volta il
            tuo CV, imposti le preferenze (ruoli, città, retribuzione minima),
            attivi l&apos;auto-apply. Da quel momento LavorAI:
          </p>
          <ol
            style={{
              fontSize: 15.5,
              lineHeight: 1.9,
              color: "rgba(255,255,255,0.85)",
              paddingLeft: 22,
              marginBottom: 24,
            }}
          >
            <li>
              <strong>Sincronizza il pool</strong> di annunci ogni 6h da fonti
              ATS (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) +
              aggregatori italiani (Adzuna).
            </li>
            <li>
              <strong>Filtra per match</strong> col tuo profilo (algoritmo
              CV↔job scoring, soglia impostabile).
            </li>
            <li>
              <strong>Riscrive CV + cover letter</strong> per ogni annuncio con
              Claude AI (tone-matched, keyword ATS).
            </li>
            <li>
              <strong>Compila il form</strong> di candidatura via Playwright su
              portali ATS supportati o invia email al recruiter dove disponibile.
            </li>
            <li>
              <strong>Ti notifica</strong> ogni consegna confermata + traccia le
              risposte via email inbound parsing.
            </li>
          </ol>
        </section>

        {/* ============ SEO H2 SECTION 2 ============ */}
        <section
          style={{
            padding: "60px 24px",
            maxWidth: 900,
            margin: "0 auto",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 20,
            }}
          >
            Perché un software di candidature automatiche
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 16,
            }}
          >
            La ricerca del lavoro moderna è un problema di volume: il candidato
            medio invia 30-50 candidature prima di ricevere una risposta seria.
            Farlo a mano significa <strong>15-30 minuti per singola candidatura</strong>{" "}
            (leggere annuncio, adattare CV, scrivere cover letter, compilare
            form). Un mese di ricerca full-time.
          </p>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 16,
            }}
          >
            LavorAI comprime quel tempo a{" "}
            <strong>~30 secondi per candidatura</strong>, senza tagliare qualità:
            ogni CV è ottimizzato per l&apos;annuncio specifico (keyword ATS
            match), ogni cover letter è scritta in italiano nativo dal contesto
            reale della job description.
          </p>
        </section>

        {/* ============ SEO H2 SECTION 3 — FAQ inline ============ */}
        <section
          style={{
            padding: "60px 24px",
            maxWidth: 900,
            margin: "0 auto",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 24,
            }}
          >
            Domande frequenti
          </h2>

          {[
            {
              q: "È legale inviare candidature in automatico?",
              a: "Sì. Le candidature vengono inviate col tuo consenso esplicito attraverso i normali canali pubblici degli annunci (portali ATS, form web, email pubbliche di recruiting). Nessuno spam, nessun abuso di piattaforma.",
            },
            {
              q: "Con quali portali funziona l'auto-apply?",
              a: "Direttamente su Greenhouse, Lever, Ashby, Workable, SmartRecruiters (submit reale su ATS con conferma HTTP). Per annunci LinkedIn + Adzuna facciamo fallback via email al recruiter quando disponibile pubblicamente.",
            },
            {
              q: "Il CV viene modificato per ogni candidatura?",
              a: "Sì. Claude Sonnet AI riscrive summary + bullet delle esperienze in base ai keyword dell'annuncio (rispettando i tuoi dati reali — nessuna invenzione). Anche la cover letter è unica per ogni azienda.",
            },
            {
              q: "Quanto costa?",
              a: "Free: 3 candidature/mese. Pro €19.99/mese: 50 candidature/mese. Pro+ €39.99/mese: illimitate + priority queue + coaching colloqui. Disdici quando vuoi. Rimborso integrale se in 24h dall'upgrade non ricevi almeno 1 candidatura consegnata.",
            },
            {
              q: "Cosa succede se voglio candidarmi solo ad alcuni annunci?",
              a: "Puoi usare la modalità 'Hybrid': LavorAI trova e prepara le candidature, tu approvi con 1 click ognuna dal dashboard prima dell'invio. Zero automazione cieca.",
            },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                marginBottom: 20,
                paddingBottom: 20,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#fff",
                }}
              >
                {f.q}
              </h3>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.75)",
                  margin: 0,
                }}
              >
                {f.a}
              </p>
            </div>
          ))}
        </section>

        {/* ============ CTA FINALE ============ */}
        <section
          style={{
            padding: "80px 24px 100px",
            maxWidth: 700,
            margin: "0 auto",
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(1.8rem, 3vw, 2.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            Prova LavorAI gratis
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.7)",
              marginBottom: 28,
            }}
          >
            3 candidature vere al mese, senza carta di credito, senza vincoli.
            Se non ti convince, non paghi nulla.
          </p>
          <Link
            href="/signup"
            className="ds-btn"
            style={{
              background: "hsl(var(--primary))",
              color: "#001a0d",
              padding: "16px 32px",
              borderRadius: 12,
              fontSize: 17,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Attiva auto-apply ora →
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
