"use client";

import { useEffect, useState } from "react";

interface Stats {
  users: number;
  applicationsToday: number;
  applicationsTotal: number;
}

/**
 * Badge live che pesca stats REALI dal DB via /api/public/stats.
 * Nessun numero inventato: se sono zero, sono zero.
 * Cache lato edge 60s → basso load anche con landing traffic.
 *
 * variant="hero": badge grande sopra H1 con pallino animato
 * variant="inline": snippet piccolo compatto (sotto CTA o in footer)
 */
export function LiveStatsBadge({
  variant = "hero",
}: {
  variant?: "hero" | "inline";
}) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setStats(data);
      })
      .catch(() => {
        /* silenzioso: se non risponde, non mostriamo niente */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return null;

  // Se abbiamo zero utenti reali (edge case), nascondiamo — meglio niente
  // che "0 utenti" che sarebbe controproducente.
  if (stats.users === 0 && stats.applicationsTotal === 0) return null;

  if (variant === "hero") {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
        style={{
          borderColor: "hsl(var(--primary) / 0.4)",
          background: "hsl(var(--primary) / 0.08)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "hsl(var(--primary))",
            boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
            animation: "livepulse 2s ease-in-out infinite",
          }}
        />
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.1em",
            color: "hsl(var(--primary))",
            textTransform: "uppercase",
          }}
        >
          Beta · {stats.users} utenti fondatori · {stats.applicationsTotal}{" "}
          candidature preparate
        </span>
        <style>{`
          @keyframes livepulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.3); }
          }
        `}</style>
      </div>
    );
  }

  // inline variant
  return (
    <span
      style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}
      className="inline-flex items-center gap-1.5"
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: "hsl(var(--primary))",
          animation: "livepulse 2s ease-in-out infinite",
        }}
      />
      {stats.applicationsToday > 0
        ? `${stats.applicationsToday} candidature preparate nelle ultime 24h`
        : `${stats.applicationsTotal} candidature preparate in totale`}
    </span>
  );
}
