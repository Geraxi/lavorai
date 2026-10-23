/**
 * Guardia di sicurezza per l'invio dalla casella dell'utente.
 *
 *  - NODE_ENV=test               → SEMPRE dry-run (nessuna flag può forzarlo).
 *  - produzione = SOLO VERCEL_ENV=production → live, salvo APPLICATIONS_PAUSED o MAILBOX_SEND_DRY_RUN=true.
 *  - tutto il resto (dev, preview, `next start` locale con NODE_ENV=production, altri host)
 *    → dry-run, salvo MAILBOX_SEND_LIVE=true esplicito. Fail closed: un build locale non invia mai.
 *
 * In dry-run nessuna chiamata di rete raggiunge Gmail/Graph: l'invio viene
 * registrato con dryRun=true e un id sintetico "dryrun-…" (sink locale), così
 * non può mai essere scambiato per un invio reale né contare nelle metriche.
 */
export type SendMode = { live: true } | { live: false; reason: "test_env" | "non_production" | "dry_run_flag" | "applications_paused" };

type Env = Record<string, string | undefined>;

export function resolveSendMode(env: Env = process.env): SendMode {
  const nodeEnv = env.NODE_ENV ?? "development";
  const vercelEnv = env.VERCEL_ENV;
  const paused = env.APPLICATIONS_PAUSED?.trim().toLowerCase();
  if (nodeEnv === "test") return { live: false, reason: "test_env" };
  if (paused && paused !== "false") return { live: false, reason: "applications_paused" };
  if (env.MAILBOX_SEND_DRY_RUN === "true") return { live: false, reason: "dry_run_flag" };
  if (vercelEnv === "production") return { live: true };
  return env.MAILBOX_SEND_LIVE === "true" ? { live: true } : { live: false, reason: "non_production" };
}

/** Per-user daily cap for real Gmail sends (env GMAIL_DAILY_SEND_CAP, default 10, 0 = block all). */
export function gmailDailySendCap(env: Env = process.env): number {
  const raw = env.GMAIL_DAILY_SEND_CAP?.trim();
  if (!raw) return 10;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 10;
}

/** Start of the current calendar day in Europe/Rome (the users' day), as a UTC instant. */
export function romeDayStart(now: Date): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs);
}
