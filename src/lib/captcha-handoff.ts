/**
 * A posting protected by an interactive captcha can never be auto-submitted
 * (by design, we do not bypass captchas). It must never be skipped silently
 * either: every mode routes it to the user's manual queue with a clear,
 * actionable message and a notification. Nothing has been submitted.
 */
export function captchaHandoff(input: { mode: string | null | undefined; company?: string | null; adapterLabel: string; detail?: string | null; at?: Date }) {
  const company = input.company?.trim() || "L'azienda";
  return {
    status: "ready_to_apply" as const,
    submitConfirmation: "CAPTCHA" as const,
    errorMessage:
      `Da completare a mano: ${company} protegge il form ${input.adapterLabel} con un captcha, quindi non possiamo inviarlo noi. ` +
      `Nessuna candidatura è stata inviata. Il CV e le risposte sono pronti: apri il link, completa il captcha e premi Invia (circa 1 minuto).`,
    canaryLog: JSON.stringify({ captcha: true, mode: input.mode ?? "manual", routedTo: "manual_queue",
      detail: input.detail?.slice(0, 300) ?? null, at: (input.at ?? new Date()).toISOString() }),
    notifyUser: true,
  };
}
