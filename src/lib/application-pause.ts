import { sendersPaused } from "./sender-hold";
/** Server-only operational hold. No customer preferences or consent are changed.
 * Apply the same setting to every web/worker deployment and retire old instances.
 * Unset/false preserves normal operation; any other nonempty value fails closed.
 */
export function applicationsPaused(): boolean {
  const value = process.env.APPLICATIONS_PAUSED?.trim().toLowerCase();
  return sendersPaused() || (!!value && value !== "false");
}

export function assertApplicationsRunning(): void {
  if (applicationsPaused()) throw new Error("applications_paused");
}
