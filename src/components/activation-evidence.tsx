import type { loadActivationEvidence } from "@/lib/activation-evidence";
type Metrics = Awaited<ReturnType<typeof loadActivationEvidence>>;
export function ActivationEvidence({ metrics: m }: { metrics: Metrics | null }) {
  if (!m) return <section className="adm-card" role="status">Metriche di attivazione non disponibili. Ricarica per riprovare; i dati non sono zero.</section>;
  const labels = ["Email verificata", "CV caricato", "Preferenze impostate", "Prima candidatura confermata", "Risposta recruiter rilevata"];
  return <section className="adm-card"><div className="adm-card-head"><div><h2 className="adm-card-title">Attivazione con prove</h2><p className="adm-card-sub">{m.cohort} iscritti nel periodo, account test esclusi. Stato attuale della coorte, non una cronologia degli abbandoni.</p></div></div>
    <div className="activation-evidence-table"><table><thead><tr><th>Passaggio</th><th>Con prove</th><th>Ancora senza prova</th></tr></thead><tbody>{m.stages.map(s => <tr key={s.index}><td>{labels[s.index]}</td><td>{s.completed} / {s.entering}</td><td>{s.withoutEvidence}</td></tr>)}</tbody></table></div>
    <p className="adm-card-sub">Ogni riga considera chi soddisfa i passaggi precedenti. Senza prova non significa abbandono. Su tutta la coorte: {m.firstConfirmed} utenti con almeno un invio confermato; {m.recruiterResponse} con risposta classificata come recruiter. Email accettate senza consegna, aperture e stati manuali esclusi dagli invii confermati. {m.unverifiedLegacy} candidature storiche hanno esito non verificabile.</p>
    <div className="activation-observations">{[["Carta verificata · utenti della coorte", m.observations.card], ["Avvii Google osservati · periodo", m.observations.googleStarts], ["Errori Google osservati · periodo", m.observations.googleFailures]].map(([label, value]) => <div key={label!}><span>{label}</span><strong>{value ?? "Sconosciuto"}</strong></div>)}</div>
    <p className="adm-card-sub">Carta: solo nuove verifiche server Stripe, non carte attualmente presenti né pagamenti. Google: segnali browser first-party, inclusi eventuali tentativi test/anonimi; possono mancare o ripetersi. Nessun tasso di errore o storico ricostruito. Nessuna osservazione disponibile = sconosciuto.</p>
  </section>;
}
