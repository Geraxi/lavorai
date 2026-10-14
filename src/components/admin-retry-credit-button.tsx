"use client";

import { useState } from "react";

type Candidate = { id: string; userId: string; jobId: string; version: string };
type RetryResult = {
  dryRun?: boolean; found?: number; hasMore?: boolean; nextCursor?: string | null; candidates?: Candidate[];
  skipped?: { id: string; reason: string }[]; requeued?: number;
  enqueueWarnings?: string[]; unknownIds?: string[]; error?: string;
};

export function AdminRetryCreditButton() {
  const [running, setRunning] = useState(false);
  const [days, setDays] = useState(14);
  const [result, setResult] = useState<RetryResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [workerHealthy, setWorkerHealthy] = useState(false);

  async function run(live = false, cursor?: string) {
    if (running) return;
    const candidates = result?.candidates ?? [];
    if (live && (!selected.length || !workerHealthy || !confirm(
      `Riaccodare queste ${selected.length} candidature reali? Il worker potrà consumare crediti AI e inviare candidature ai datori di lavoro.\n\n${selected.join("\n")}`,
    ))) return;
    setRunning(true);
    try {
      const response = await fetch("/api/admin/retry-credit-failures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(live ? {
          dryRun: false, days, mode: selected.length === 1 ? "canary" : "batch",
          applicationIds: selected,
          versions: Object.fromEntries(candidates.filter((c) => selected.includes(c.id)).map((c) => [c.id, c.version])),
          workerHealthConfirmed: workerHealthy,
        } : { dryRun: true, days, limit: 200, ...(cursor ? { cursor } : {}) }),
      });
      const next: RetryResult = await response.json();
      setResult(next);
      setSelected([]);
      setWorkerHealthy(false);
    } catch {
      // The request might have committed. Never offer a blind one-click retry.
      setResult({ error: "Esito non verificato. Controlla gli stati prima di ripetere l’anteprima." });
      setSelected([]);
      setWorkerHealthy(false);
    } finally { setRunning(false); }
  }

  return (
    <div style={{ marginTop: 10, fontSize: 13 }}>
      <label>Intervallo esplicito: {" "}
        <select value={days} disabled={running} onChange={(event) => {
          setDays(Number(event.target.value)); setResult(null); setSelected([]); setWorkerHealthy(false);
        }}>
          <option value={14}>Ultimi 14 giorni</option>
          <option value={30}>Ultimi 30 giorni</option>
        </select>
      </label>{" "}
      <button type="button" onClick={() => run()} disabled={running}>
        {running ? "Controllo…" : "Anteprima retry crediti AI"}
      </button>
      {result?.error && <p role="alert">Errore: {result.error}</p>}
      {result?.dryRun && <div>
        <p>{result.candidates?.length ?? 0} idonee su {result.found} esaminate in questa pagina. Nessuna riaccodata.
          {result.hasMore && " Anteprima parziale: altri record fuori dal limite."}</p>
        {result.nextCursor && <button type="button" disabled={running} onClick={() => run(false, result.nextCursor!)}>Anteprima pagina successiva</button>}
        {(result.candidates ?? []).map((candidate) => <label key={candidate.id} style={{ display: "block", overflowWrap: "anywhere" }}>
          <input type="checkbox" disabled={running || (!selected.includes(candidate.id) && selected.length >= 10)}
            checked={selected.includes(candidate.id)} onChange={(event) => setSelected((ids) => event.target.checked
              ? [...ids, candidate.id] : ids.filter((id) => id !== candidate.id))} />
          {candidate.id} (job {candidate.jobId})
        </label>)}
        {!!result.candidates?.length && <>
          <p>Seleziona prima una sola candidatura di prova reale. Verifica l’esito prima di procedere con un lotto (massimo 10).</p>
          <label style={{ display: "block" }}><input type="checkbox" checked={workerHealthy} disabled={running}
            onChange={(event) => setWorkerHealthy(event.target.checked)} />
            Ho appena verificato che il worker è operativo e i crediti AI sono disponibili.
          </label>
          <button type="button" disabled={running || !selected.length || !workerHealthy} onClick={() => run(true)}>
            {selected.length === 1 ? "Riaccoda 1 prova reale" : `Riaccoda ${selected.length} selezionate`}
          </button>
        </>}
      </div>}
      {result && !result.error && result.dryRun === false && <p>
        {result.requeued} riaccodamenti confermati. Verifica l’esito nel pannello candidature prima del prossimo lotto.
        {!!result.enqueueWarnings?.length && " Avviso coda: controlla il polling DB; non ripetere l’invio."}
      </p>}
      {!!result?.unknownIds?.length && <p role="alert">Esito incerto per {result.unknownIds.join(", ")}. Queste candidature potrebbero essere già in coda: controlla gli stati prima di riprovare.</p>}
      {!!result?.skipped?.length && <details><summary>{result.skipped.length} escluse</summary>
        {result.skipped.map((item) => <div key={item.id} style={{ overflowWrap: "anywhere" }}>{item.id}: {item.reason}</div>)}
      </details>}
    </div>
  );
}
