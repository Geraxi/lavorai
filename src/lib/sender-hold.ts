/** Deployment-scoped hold: apply to every web/worker instance before cutover. */
export function sendersPaused(): boolean {
  const value = process.env.SENDERS_PAUSED?.trim().toLowerCase();
  return !!value && value !== "false";
}
