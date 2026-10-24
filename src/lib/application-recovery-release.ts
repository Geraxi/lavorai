/**
 * Separate merge from activation. After deploy, rows that become newly
 * eligible (quota room, expired-lease recovery, answer resume) stay held
 * until APPLICATION_RECOVERY_RELEASE allows them. Historical replay stays off.
 *
 *   APPLICATION_RECOVERY_RELEASE=off          default: hold everything
 *   APPLICATION_RECOVERY_RELEASE=on           allow up to the cap
 *   APPLICATION_RECOVERY_RELEASE=id1,id2      allow only these ids (implies on)
 *   APPLICATION_RECOVERY_RELEASE_IDS=id1,id2  extra allowlist
 *   APPLICATION_RECOVERY_RELEASE_CAP=3        per-run cap (default 3, max 20)
 */

export const DEFAULT_RECOVERY_RELEASE_CAP = 3;
export const CONTROLLED_RELEASE_REASON = "controlled_release";
/** Keep in sync with heldMessage("controlled_release"). */
export const CONTROLLED_RELEASE_MESSAGE =
  "Invio in attesa: in attesa di rilascio controllato. Questa elaborazione non ha effettuato nuovi invii.";

export function controlledReleaseMessage(): string {
  return CONTROLLED_RELEASE_MESSAGE;
}

export function recoveryReleaseConfig(env: Record<string, string | undefined> = process.env): {
  enabled: boolean;
  allowIds: Set<string>;
  cap: number;
} {
  const raw = (env.APPLICATION_RECOVERY_RELEASE ?? "off").trim();
  const extra = (env.APPLICATION_RECOVERY_RELEASE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const parsedCap = Number(env.APPLICATION_RECOVERY_RELEASE_CAP ?? DEFAULT_RECOVERY_RELEASE_CAP);
  const cap = Math.max(0, Math.min(20, Number.isFinite(parsedCap) ? parsedCap : DEFAULT_RECOVERY_RELEASE_CAP));
  const lowered = raw.toLowerCase();
  if (!raw || lowered === "off" || lowered === "0" || lowered === "false") {
    return { enabled: false, allowIds: new Set(extra), cap };
  }
  if (lowered === "on" || lowered === "true" || lowered === "1") {
    return { enabled: true, allowIds: new Set(extra), cap };
  }
  const fromValue = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return { enabled: true, allowIds: new Set([...fromValue, ...extra]), cap };
}

export class RecoveryReleaseBudget {
  used = 0;
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  allow(id: string): boolean {
    const cfg = recoveryReleaseConfig(this.env);
    if (!cfg.enabled) return false;
    if (cfg.allowIds.size && !cfg.allowIds.has(id)) return false;
    return this.used < cfg.cap;
  }

  consume(id: string): boolean {
    if (!this.allow(id)) return false;
    this.used += 1;
    return true;
  }
}

export function controlledReleaseHoldData(now = new Date()) {
  return {
    startedAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    errorMessage: controlledReleaseMessage(),
  };
}
