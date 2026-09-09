import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier, getLimits, trialState } from "@/lib/billing";
import { CompanyLogo } from "@/components/design/company-logo";
import { pickMatches } from "@/lib/weekly-digest";

/**
 * Prompt persistente che spinge gli utenti Free all'upgrade "per trovare
 * lavoro più veloce". Server component: legge tier + candidature del mese
 * e sceglie la variante giusta.
 *
 *   1. Se ha già mandato = 0-1 candidature → "prova la potenza di Pro"
 *   2. Se ha usato 50%+ del limite  → "stai per finire, upgrade"
 *   3. Se ha raggiunto il limite    → "hai finito, upgrade ora per continuare"
 *
 * NON viene mostrato agli utenti Pro/Pro+ né agli admin. Non è dismissable:
 * l'unico modo per farlo sparire è o convertire o cambiare tier.
 *
 * `variant="banner"` (default, largo per dashboard/pagina lista)
 * `variant="compact"` (inline sopra liste)
 */
export async function UpgradePrompt({
  variant = "banner",
}: {
  variant?: "banner" | "compact";
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const tier = effectiveTier(user);
  if (tier !== "free") return null;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usedThisMonth = await prisma.application.count({
    where: {
      userId: user.id,
      createdAt: { gte: monthStart },
      // conta solo le candidature che hanno consumato il "credito" mensile
      status: { in: ["success", "queued", "optimizing", "applying", "ready_to_apply"] },
    },
  });

  const limits = getLimits(tier);
  const cap = limits.monthlyApplications;
  const remaining = Math.max(0, cap - usedThisMonth);
  const ratio = cap > 0 ? usedThisMonth / cap : 0;

  const state: "cold" | "warning" | "blocked" =
    remaining === 0 ? "blocked" : ratio >= 0.5 ? "warning" : "cold";

  const trial = trialState(user);
  const copy = trial.status === "ended" ? COPY.trialEnded : cap === 0 ? COPY.viewOnly : COPY[state];
  const isCompact = variant === "compact";

  // Upgrade "al momento del valore": quando è bloccato o quasi, mostra le
  // offerte compatibili entrate questa settimana che NON può inviare, coi
  // loghi reali. Un limite astratto convince poco; 4 aziende con nome sì.
  let locked: { id: string; title: string; company: string | null; url: string }[] = [];
  let lockedTotal = 0;
  if (state !== "cold") {
    try {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId: user.id }, select: { rolesJson: true, locationsJson: true } });
      const parse = (j: string | null | undefined) => { try { const v = JSON.parse(j ?? "[]"); return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
      const roles = parse(prefs?.rolesJson);
      if (roles.length) {
        const pool = await prisma.job.findMany({
          where: { cachedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
          orderBy: { cachedAt: "desc" },
          select: { id: true, title: true, company: true, location: true, url: true, remote: true },
          take: 2500,
        });
        const all = pickMatches(pool, roles, parse(prefs?.locationsJson));
        lockedTotal = all.length;
        locked = all.slice(0, 4);
      }
    } catch { /* prompt resta in versione base */ }
  }

  return (
    <div
      role="region"
      aria-label="Prompt upgrade Pro"
      style={{
        margin: isCompact ? "0 0 12px" : "12px 24px 0",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: isCompact ? "10px 14px" : "16px 18px",
        borderRadius: 14,
        background:
          state === "blocked"
            ? "linear-gradient(90deg, rgba(220,38,38,0.14), rgba(220,38,38,0.04))"
            : state === "warning"
              ? "linear-gradient(90deg, rgba(234,179,8,0.12), rgba(234,179,8,0.03))"
              : "linear-gradient(90deg, rgba(34,197,94,0.10), rgba(34,197,94,0.02))",
        border: `1px solid ${
          state === "blocked"
            ? "rgba(220,38,38,0.35)"
            : state === "warning"
              ? "rgba(234,179,8,0.35)"
              : "rgba(34,197,94,0.28)"
        }`,
      }}
    >
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: isCompact ? 34 : 42,
          height: isCompact ? 34 : 42,
          borderRadius: "50%",
          background:
            state === "blocked"
              ? "rgba(220,38,38,0.22)"
              : state === "warning"
                ? "rgba(234,179,8,0.22)"
                : "rgba(34,197,94,0.20)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isCompact ? 16 : 20,
        }}
      >
        {state === "blocked" ? "⛔" : state === "warning" ? "⚡" : "🚀"}
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div
          style={{
            fontSize: isCompact ? 13.5 : 14.5,
            fontWeight: 700,
            color: "var(--fg)",
            lineHeight: 1.35,
          }}
        >
          {copy.title(usedThisMonth, cap)}
        </div>
        <div
          style={{
            fontSize: isCompact ? 12 : 12.5,
            color: "var(--fg-muted)",
            marginTop: 3,
            lineHeight: 1.5,
          }}
        >
          {copy.body}
        </div>
        {locked.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex" }}>
              {locked.map((j, i) => (
                <div key={j.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 8, boxShadow: "0 0 0 2px var(--bg-elev, #0b1a12)" }} title={`${j.title} · ${j.company ?? ""}`}>
                  <CompanyLogo company={j.company ?? "?"} url={j.url} size={isCompact ? 22 : 26} rounded={8} />
                </div>
              ))}
            </div>
            <span style={{ fontSize: isCompact ? 11.5 : 12, color: "var(--fg)", fontWeight: 600 }}>
              {locked.map((j) => j.company).filter(Boolean).slice(0, 3).join(", ")}
              {lockedTotal > 3 ? ` e altre ${lockedTotal - 3}` : ""}
              {" "}
              <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>cercano il tuo profilo questa settimana. Con Pro ci candidiamo noi.</span>
            </span>
          </div>
        )}
      </div>

      <Link
        href="/settings#billing"
        style={{
          flexShrink: 0,
          padding: isCompact ? "8px 14px" : "10px 18px",
          borderRadius: 10,
          background: state === "blocked" ? "#dc2626" : "hsl(var(--primary))",
          color: state === "blocked" ? "#fff" : "#001a0d",
          fontSize: isCompact ? 13 : 13.5,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {copy.cta} →
      </Link>
    </div>
  );
}

const COPY = {
  cold: {
    title: (_used: number, _cap: number) =>
      "Trova lavoro fino a 17× più veloce con Pro",
    body: "Piano Free: 3 candidature. Piano Pro: 50 candidature/mese, priorità sui portali diretti, cover letter personalizzata. 7 giorni gratis, poi €19,99/mese, disdici quando vuoi.",
    cta: "Prova Pro gratis",
  },
  warning: {
    title: (used: number, cap: number) =>
      `Hai usato ${used}/${cap} candidature del mese — stai per finire`,
    body: "Ogni candidatura in più conta: più profili raggiunti = più colloqui. Con Pro passi a 50/mese e nessuna interruzione fino alla firma.",
    cta: "Prova Pro 7 giorni gratis",
  },
  viewOnly: {
    title: (_used: number, _cap: number) => "Il tuo account è in sola visualizzazione",
    body: "Vedi le offerte compatibili e le risposte, ma nessuna candidatura parte. Con Pro LavorAI si candida per te ogni giorno: 7 giorni gratis, poi €19,99/mese.",
    cta: "Attiva Pro, 7 giorni gratis",
  },
  trialEnded: {
    title: (_used: number, _cap: number) => "La prova Pro è finita: le candidature sono in pausa",
    body: "Le offerte compatibili continuano ad arrivare e ricevi le risposte a ciò che è già stato inviato. Con Pro riparti esattamente da dove ti eri fermato: €19,99/mese, disdici quando vuoi.",
    cta: "Riparti con Pro",
  },
  blocked: {
    title: (_used: number, cap: number) =>
      `Limite Free raggiunto (${cap}/mese) — pipeline in pausa`,
    body: "Il motore trova nuovi annunci ma non può più candidarti. Con Pro riparti subito: 7 giorni gratis, poi 50 candidature/mese.",
    cta: "Sblocca ora, 7 giorni gratis",
  },
} as const;
