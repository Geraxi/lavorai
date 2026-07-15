import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier, getLimits } from "@/lib/billing";

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

  const copy = COPY[state];
  const isCompact = variant === "compact";

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
    body: "Piano Free: 3 candidature/mese. Piano Pro: 50 candidature/mese, priorità sui portali diretti, cover letter personalizzata. €19/mese, disdici quando vuoi.",
    cta: "Passa a Pro",
  },
  warning: {
    title: (used: number, cap: number) =>
      `Hai usato ${used}/${cap} candidature del mese — stai per finire`,
    body: "Ogni candidatura in più conta: più profili raggiunti = più colloqui. Con Pro passi a 50/mese e nessuna interruzione fino alla firma.",
    cta: "Sblocca Pro",
  },
  blocked: {
    title: (_used: number, cap: number) =>
      `Limite Free raggiunto (${cap}/mese) — pipeline in pausa`,
    body: "Il motore ha trovato nuovi annunci ma non può più candidarti finché il piano non riparte a inizio mese. Con Pro riparti ora: 50 candidature/mese, colloqui più vicini.",
    cta: "Sblocca ora",
  },
} as const;
