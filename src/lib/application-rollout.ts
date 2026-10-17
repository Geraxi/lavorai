/** Application sending policy shared by the Vercel web runtime and the Railway
 * worker (same module, same env, same decisions).
 *
 * Default (no env needed): automatic sending is ON for users whose saved mode
 * is auto/hybrid, explicit manual confirmations keep working, and every
 * customer submission attempt reserves a slot in a global UTC-day safety cap
 * (APPLY_GLOBAL_DAILY_CAP, default 300). Per-user plan/daily quotas, consent,
 * email verification, dedup ledger and delivery-proof checks are unchanged.
 *
 * Kill switches:
 *   - APPLICATIONS_PAUSED=true          stops everything (application-pause.ts).
 *   - APPLICATION_SENDING_MODE=manual_only  restores the Oct 14 manual-only hold
 *     (automatic producers blocked; only fresh explicit confirmations send).
 *
 * Legacy APPLICATION_ROLLOUT_MODE / APPLICATION_ROLLOUT_DAILY_CAP no longer
 * decide anything. APPLICATION_ROLLOUT_START_AT is still read as the
 * historical cutoff (rows created before it are never sent automatically).
 * Set but invalid values fail closed; missing values use safe defaults.
 */
export const ROLLOUT_BUDGET_HELD_MESSAGE = "Limite temporaneo giornaliero complessivo raggiunto. Candidatura conservata, non inviata; materiali disponibili. Nessun nuovo tentativo automatico: attendi una revisione o completa personalmente dal portale.";

/** Default global safety ceiling across all users/channels per UTC day. */
export const DEFAULT_GLOBAL_DAILY_CAP = 300;
/** Hard upper bound accepted from env, to catch typos like an extra zero. */
export const MAX_GLOBAL_DAILY_CAP = 5000;
/** Historical cutoff when APPLICATION_ROLLOUT_START_AT is not configured: the
 * Oct 14, 2026 repaired-sender release. Older rows are never (re)sent. */
export const DEFAULT_HISTORICAL_CUTOFF = "2026-10-14T12:04:49.000Z";

export type ApplicationSendingMode = "automatic" | "manual_only";

export function applicationRolloutConfig(now = new Date()): {
  enabled: boolean; reason: string | null; mode: ApplicationSendingMode | null;
  startedAt: Date | null; dailyCap: number | null;
} {
  const closed = (reason: string) => ({ enabled: false, reason, mode: null, startedAt: null, dailyCap: null });
  const rawMode = (process.env.APPLICATION_SENDING_MODE ?? "").trim();
  if (rawMode !== "" && rawMode !== "automatic" && rawMode !== "manual_only") return closed("sending_mode_invalid");
  const mode: ApplicationSendingMode = rawMode === "manual_only" ? "manual_only" : "automatic";

  const start = process.env.APPLICATION_ROLLOUT_START_AT || DEFAULT_HISTORICAL_CUTOFF;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start)) return closed("rollout_start_invalid");
  const startedAt = new Date(start);
  if (!Number.isFinite(+startedAt) || startedAt.toISOString() !== start.replace(/(?<!\.\d{3})Z$/, ".000Z")) return closed("rollout_start_invalid");
  if (+startedAt >= +now) return closed("rollout_not_started");

  const rawCap = process.env.APPLY_GLOBAL_DAILY_CAP;
  let dailyCap = DEFAULT_GLOBAL_DAILY_CAP;
  if (rawCap !== undefined && rawCap !== "") {
    if (!/^[1-9]\d{0,4}$/.test(rawCap) || Number(rawCap) > MAX_GLOBAL_DAILY_CAP) return closed("global_cap_invalid");
    dailyCap = Number(rawCap);
  }
  return { enabled: true, reason: null, mode, startedAt, dailyCap };
}

/** True when scheduled/onboarding automatic producers must not create or send. */
export function automaticApplicationsBlocked(): boolean {
  const config = applicationRolloutConfig();
  return !config.enabled || config.mode !== "automatic";
}

/** Replays of historical/failed/stale work (admin repair/reset/retry routes,
 * transient/credit/CAPTCHA retries, stale-claim recovery, multi-attempt queue
 * jobs) stay suspended: they are the paths that can double-send or revive
 * rows whose outcome was never verified. Not changed by the sending mode. */
export function historicalRetriesBlocked(): boolean { return true; }

export function rolloutCreationBlocked(): boolean { return !applicationRolloutConfig().enabled; }

export function rolloutApplicationIneligibility(row: {
  createdAt: Date; consentGrantedAt: Date | null; retryCount?: number;
}, now = new Date()): string | null {
  const config = applicationRolloutConfig(now);
  if (!config.enabled) return config.reason;
  if (!(row.createdAt instanceof Date) || !Number.isFinite(+row.createdAt)
    || +row.createdAt <= +config.startedAt! || +row.createdAt > +now) return "rollout_historical_application";
  // Automatic mode: a row without per-application consent is admitted here and
  // the worker gate still requires the user's saved mode to be "auto" (manual
  // and hybrid rows always need consentGrantedAt there). A consent that is
  // present must still be fresh.
  if (row.consentGrantedAt === null && config.mode === "automatic") {
    // fall through to retry check
  } else if (!(row.consentGrantedAt instanceof Date) || !Number.isFinite(+row.consentGrantedAt)
    || +row.consentGrantedAt <= +config.startedAt! || +row.consentGrantedAt > +now) return "rollout_explicit_consent_required";
  if (row.retryCount !== undefined && row.retryCount !== 0) return "rollout_retry_blocked";
  return null;
}
