import Link from "next/link";
import type { AttentionItem } from "@/lib/attention";
import type { ChecklistState } from "@/components/onboarding-checklist";
export function AttentionQueue({ queue, state, locale }: { queue: { items: AttentionItem[]; limited: boolean; unread: number; unknownRead: number; drafts: number } | null; state: ChecklistState; locale: string }) {
  const en = locale === "en"; const tr = (it: string, english: string) => en ? english : it;
  const next = queue?.items[0] ?? (!state.hasVerifiedEmail ? { href: "/verify-email", detail: tr("Verifica la tua email", "Verify your email"), title: tr("Completa il tuo account", "Complete your account") }
    : !state.hasUploadedCv ? { href: "/cv", detail: tr("Carica il tuo CV", "Upload your CV"), title: tr("Prepara il tuo profilo", "Prepare your profile") }
    : !state.hasSetPreferences ? { href: "/preferences", detail: tr("Imposta le preferenze", "Set your preferences"), title: tr("Definisci la tua ricerca", "Define your search") }
    : { href: "/discover", detail: tr("Esplora le opportunità", "Explore opportunities"), title: tr("Scegli il prossimo ruolo", "Choose your next role") });
  return <section className="workspace-panel attention-panel" aria-label={tr("Richiede la tua attenzione", "Needs your attention")}>
    <div className="attention-next"><div><div className="workspace-eyebrow">{tr("Il prossimo passo", "Your next step")}</div><h2>{queue === null ? tr("Attività non disponibili", "Activity unavailable") : next.title}</h2><p className="workspace-muted">{queue === null ? tr("Ricarica la dashboard per riprovare.", "Reload the dashboard to try again.") : next.detail}</p></div>
      <Link href={queue === null ? "/dashboard" : next.href} className="ds-btn ds-btn-primary">{queue === null ? tr("Riprova", "Retry") : tr("Apri", "Open")}</Link></div>
    <div className="attention-heading"><h2>{tr("Richiede la tua attenzione", "Needs your attention")} {queue && <span className="workspace-chip">{queue.items.length}{queue.limited ? "+" : ""}</span>}</h2><Link href="/inbox" className="fit-link">{queue ? `${queue.unread} ${tr("non letti", "unread")} · ${queue.drafts} ${tr("bozze", "drafts")}` : tr("Apri inbox", "Open inbox")}</Link></div>
    <div className="attention-list">{queue?.items.length ? queue.items.map(item => <Link key={item.id} href={item.href} className="attention-row"><span><strong>{item.title}</strong><small>{item.detail}</small></span><span>{item.unread === true && <b className="workspace-chip">{tr("Non letto", "Unread")}</b>}{item.date && <time dateTime={item.date}>{new Date(item.date).toLocaleDateString(en ? "en-GB" : "it-IT")}</time>}</span></Link>) : queue && <p className="workspace-muted">{tr("Nessuna azione rilevata nella selezione recente.", "No action found in the recent selection.")}</p>}</div>
    <small className="workspace-muted">{tr("Fino a 50 candidature e 200 messaggi recenti per fonte. Apri Candidature o Inbox per continuare.", "Up to 50 applications and 200 recent messages per source. Open Applications or Inbox to continue.")}{!!queue?.unknownRead && ` ${tr("Lettura storica sconosciuta:", "Historical read state unknown:")} ${queue.unknownRead}.`}</small>
  </section>;
}
