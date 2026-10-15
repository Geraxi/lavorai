"use client";
import Link from "next/link";
import { useLocale } from "next-intl";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const en = useLocale() === "en";
  return <section className="workspace-recovery" role="alert">
    <h1>{en ? "This section could not load" : "La sezione non è disponibile"}</h1>
    <p>{en ? "Try again. You can also return to the dashboard or report the problem." : "Riprova. Puoi anche tornare alla dashboard o segnalare il problema."}</p>
    <div><button type="button" className="ds-btn ds-btn-primary" onClick={reset}>{en ? "Try again" : "Riprova"}</button><Link className="ds-btn" href="/dashboard">Dashboard</Link><Link className="ds-btn ds-btn-ghost" href="/feedback">{en ? "Report a problem" : "Segnala un problema"}</Link></div>
  </section>;
}
