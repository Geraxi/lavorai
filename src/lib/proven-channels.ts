/**
 * Proven-channels pilot: restrict auto-apply to Greenhouse forms we can
 * answer truthfully and to jobs with a published employer-domain inbox.
 * Default mode is pilot (allow-list). Empty allow-list means nobody is
 * restricted. Switch to all users with PROVEN_CHANNEL_MODE=all.
 */
export type ProvenChannelMode = "off" | "pilot" | "all";

export function provenChannelMode(
  env: Record<string, string | undefined> = process.env,
): ProvenChannelMode {
  const raw = (env.PROVEN_CHANNEL_MODE ?? "pilot").trim().toLowerCase();
  if (raw === "off" || raw === "all") return raw;
  return "pilot";
}

export function provenChannelPilotUserIds(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.PROVEN_CHANNEL_PILOT_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** True when this user's auto-apply pool is restricted to proven channels. */
export function usesProvenChannelFilter(
  userId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const mode = provenChannelMode(env);
  if (mode === "off" || !userId.trim()) return false;
  if (mode === "all") return true;
  return provenChannelPilotUserIds(env).includes(userId);
}

export const GREENHOUSE_NATIVE_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
] as const;

export function isGreenhouseNativeHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return GREENHOUSE_NATIVE_HOSTS.some((listed) => h === listed || h.endsWith(`.${listed}`));
}
