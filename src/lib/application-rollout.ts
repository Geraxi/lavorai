/** Temporary, explicitly configured manual-only reopening. Missing or invalid
 * settings never restore legacy automatic behavior or imply an unlimited cap. */
export const ROLLOUT_BUDGET_HELD_MESSAGE = "Limite temporaneo giornaliero complessivo raggiunto. Candidatura conservata, non inviata; materiali disponibili. Nessun nuovo tentativo automatico: attendi una revisione o completa personalmente dal portale.";

export function applicationRolloutConfig(now = new Date()): {
  enabled: boolean; reason: string | null; startedAt: Date | null; dailyCap: number | null;
} {
  const closed = (reason: string) => ({ enabled: false, reason, startedAt: null, dailyCap: null });
  if (process.env.APPLICATION_ROLLOUT_MODE !== "manual_only") return closed("rollout_disabled");
  const start = process.env.APPLICATION_ROLLOUT_START_AT ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start)) return closed("rollout_start_invalid");
  const startedAt = new Date(start);
  if (!Number.isFinite(+startedAt) || startedAt.toISOString() !== start.replace(/(?<!\.\d{3})Z$/, ".000Z")) return closed("rollout_start_invalid");
  // The approved temporary ceiling is ten globally, never ten per account.
  const cap = process.env.APPLICATION_ROLLOUT_DAILY_CAP ?? "";
  if (!/^(?:[1-9]|10)$/.test(cap)) return closed("rollout_cap_invalid");
  if (+startedAt >= +now) return closed("rollout_not_started");
  return { enabled: true, reason: null, startedAt, dailyCap: Number(cap) };
}

/** No automatic/retry mode is implemented by this temporary release. */
export function automaticApplicationsBlocked(): boolean { return true; }

export function rolloutCreationBlocked(): boolean { return !applicationRolloutConfig().enabled; }

export function rolloutApplicationIneligibility(row: {
  createdAt: Date; consentGrantedAt: Date | null; retryCount?: number;
}, now = new Date()): string | null {
  const config = applicationRolloutConfig(now);
  if (!config.enabled) return config.reason;
  if (!(row.createdAt instanceof Date) || !Number.isFinite(+row.createdAt)
    || +row.createdAt <= +config.startedAt! || +row.createdAt > +now) return "rollout_historical_application";
  if (!(row.consentGrantedAt instanceof Date) || !Number.isFinite(+row.consentGrantedAt)
    || +row.consentGrantedAt <= +config.startedAt! || +row.consentGrantedAt > +now) return "rollout_explicit_consent_required";
  if (row.retryCount !== undefined && row.retryCount !== 0) return "rollout_retry_blocked";
  return null;
}
