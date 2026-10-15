import Link from "next/link";
import type { AutoApplyReadiness } from "@/lib/auto-apply-readiness";
import { Icon } from "@/components/design/icon";

const english: Record<string, string> = {
  "Candidature": "Applications", "Invii in pausa": "Submissions paused",
  "Gli invii sono temporaneamente sospesi. Le tue preferenze e lo storico sono conservati.": "Submissions are temporarily paused. Your preferences and history are preserved.",
  "Vedi candidature": "View applications", "Solo candidature confermate": "Applications require your confirmation", "Vedi le offerte": "View jobs",
  "In attesa del tuo CV": "Waiting for your CV", "Carica un CV, anche una prima bozza: è il documento che LavorAI adatta a ogni candidatura.": "Upload your CV, even a first draft. LavorAI adapts it for each application.",
  "Carica il CV": "Upload CV", "Imposta i ruoli e le località": "Set roles and locations", "Ci servono per cercare offerte compatibili con il tuo profilo.": "These help find jobs matching your profile.",
  "Imposta preferenze": "Set preferences", "La ricerca automatica è in pausa": "Automatic search paused", "Riattivala dalle Preferenze quando vuoi riprendere a cercare e candidarti.": "Resume it from Preferences when you want to search and apply again.",
  "Riattiva auto-apply": "Resume auto-apply", "Completa le informazioni richieste per farle proseguire.": "Complete the required information to continue.", "Completa le risposte": "Complete answers",
  "Rivedile e conferma quelle che vuoi inviare.": "Review and confirm the applications you want to submit.", "Rivedi candidature": "Review applications",
  "Ricerca attiva": "Search active", "Non ci sono ancora offerte compatibili nel pool. LavorAI continua a cercare per te.": "No matching jobs are available yet. LavorAI continues searching.", "Vedi preferenze": "View preferences",
  "Auto-apply al lavoro": "Auto-apply active", "Profilo pronto, ricerca attiva": "Profile ready, search active",
};
function translated(text: string): string {
  if (english[text]) return english[text];
  return text
    .replace(/^L'invio automatico è sospeso\. Il servizio accetta soltanto nuove candidature confermate esplicitamente, con un limite complessivo di (\d+) invii al giorno \(UTC\)\. Le tue preferenze restano salvate\.$/, "Automatic submissions are paused. The service accepts only new applications you explicitly confirm, with a global cap of $1 submissions per day (UTC). Your preferences remain saved.")
    .replace(/^(\d+) candidat(?:ura richiede|ure richiedono) una risposta$/, "$1 application(s) need answers")
    .replace(/^(\d+) candidat(?:ura attende|ure attendono) il tuo consenso$/, "$1 application(s) await your consent")
    .replace(/^Hai già (\d+) candidat(?:ura inviata|ure inviate)\. Stiamo monitorando (\d+) offerte compatibili\.$/, "$1 applications recorded. Monitoring $2 matching jobs.")
    .replace(/^Stiamo valutando (\d+) offerte compatibili con le tue preferenze\.$/, "Evaluating $1 jobs matching your preferences.");
}

export function AutoApplyReadinessCard({ readiness, locale = "it" }: { readiness: AutoApplyReadiness; locale?: string }) {
  const copy = locale === "en" ? { ...readiness, eyebrow: translated(readiness.eyebrow), title: translated(readiness.title), detail: translated(readiness.detail), cta: translated(readiness.cta) } : readiness;
  const color = readiness.tone === "ready" ? "#2ED69A" : readiness.tone === "paused" ? "#A7AAB6" : "#F3B541";
  return (
    <section className="fit-card dg-side-card" aria-label={locale === "en" ? "Application service status" : "Stato auto-apply"} style={{ borderColor: `color-mix(in srgb, ${color} 34%, var(--border-ds))` }}>
      <div className="fit-card-head" style={{ alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color, fontSize: 11, fontWeight: 750, letterSpacing: ".04em", textTransform: "uppercase" }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: color, boxShadow: `0 0 10px ${color}` }} />
            {copy.eyebrow}
          </div>
          <div style={{ color: "var(--fg)", fontWeight: 700, fontSize: 13.5, marginTop: 7 }}>{copy.title}</div>
          <p style={{ margin: "5px 0 0", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.45 }}>{copy.detail}</p>
        </div>
      </div>
      <Link href={readiness.href} className="fit-link" style={{ display: "inline-flex", marginTop: 10, fontSize: 12.5 }}>
        {copy.cta} <Icon name="arrow-right" size={12} />
      </Link>
    </section>
  );
}
