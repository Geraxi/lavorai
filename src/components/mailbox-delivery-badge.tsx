import { MAILBOX_STATE_LABEL, type MailboxState } from "@/lib/mailbox/delivery-state";
import { CircleCheck, CircleDashed, CircleAlert, CircleX, Send, FlaskConical } from "lucide-react";

const ICON = { prepared: CircleDashed, approved: CircleDashed, submitted: Send, delivery_confirmed: CircleCheck, failed: CircleX, unverified: CircleAlert } as const;

export interface MailboxBadgeData { state: string; dryRun: boolean; provider: string; recipient: string; failureReason: string | null }

/** Badge stato di consegna per gli invii dalla casella dell'utente. Mai verde senza evidenza. */
export function MailboxDeliveryBadge({ data, lang = "it" }: { data: MailboxBadgeData; lang?: "it" | "en" }) {
  if (data.dryRun) {
    const t = lang === "en" ? "Simulation, not sent" : "Simulazione, non inviata";
    return <span className="pm-pill tone-neutral mbx-badge" title={lang === "en" ? "Dry run: no email left the server." : "Modalità di prova: nessuna email è uscita dal server."}><FlaskConical size={12} strokeWidth={1.75} aria-hidden /> {t}</span>;
  }
  const state = (data.state in MAILBOX_STATE_LABEL ? data.state : "unverified") as MailboxState;
  const cfg = MAILBOX_STATE_LABEL[state];
  const Icon = ICON[state];
  const via = data.provider === "gmail" ? "Gmail" : "Outlook";
  const title = `${cfg.detail} · ${via} → ${data.recipient}${data.failureReason && state !== "delivery_confirmed" ? ` · ${data.failureReason}` : ""}`;
  return <span className={`pm-pill tone-${cfg.tone} mbx-badge`} title={title} aria-label={`${cfg[lang]}. ${title}`}><Icon size={12} strokeWidth={1.75} aria-hidden /> {cfg[lang]}</span>;
}
