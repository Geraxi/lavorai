"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { CircleAlert, FileDiff, ShieldCheck } from "lucide-react";
import type { CvDiffLine, CvDiffSummary } from "@/lib/cv-diff";

interface CompareResponse {
  text?: string;
  compare: null | {
    originalFilename: string;
    originalUploadedAt: string;
    summary: CvDiffSummary;
    lines: CvDiffLine[];
    yearsNotInOriginal: string[];
  };
}

type Block =
  | { kind: "change"; lines: CvDiffLine[] }
  | { kind: "context"; lines: CvDiffLine[] }
  | { kind: "collapsed"; count: number; lines: CvDiffLine[] };

const CONTEXT = 1;

/** Raggruppa le righe invariate lunghe in blocchi comprimibili. */
function toBlocks(lines: CvDiffLine[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].op !== "same") {
      const start = i;
      while (i < lines.length && lines[i].op !== "same") i++;
      blocks.push({ kind: "change", lines: lines.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].op === "same") i++;
    const run = lines.slice(start, i);
    const head = start === 0 ? 0 : CONTEXT;
    const tail = i === lines.length ? 0 : CONTEXT;
    if (run.length <= head + tail + 1) {
      blocks.push({ kind: "context", lines: run });
    } else {
      if (head) blocks.push({ kind: "context", lines: run.slice(0, head) });
      blocks.push({ kind: "collapsed", count: run.length - head - tail, lines: run.slice(head, run.length - tail) });
      if (tail) blocks.push({ kind: "context", lines: run.slice(run.length - tail) });
    }
  }
  return blocks;
}

/**
 * Differenze tra il CV originale e il CV su misura di una candidatura.
 * Mostra cosa è stato riformulato e ricorda cosa NON può cambiare
 * (datori di lavoro, ruoli, date, titoli di studio), verificato anche
 * lato server da src/lib/cv-fact-guard.ts al momento della generazione.
 */
export function CvChanges({ applicationId, hasDocx }: { applicationId: string; hasDocx: boolean }) {
  const en = useLocale() === "en";
  const t = (it: string, eng: string) => (en ? eng : it);
  const [state, setState] = useState<{ loading: boolean; data?: CompareResponse; error?: boolean }>({ loading: true });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!hasDocx) { setState({ loading: false }); return; }
    let cancelled = false;
    setState({ loading: true });
    setExpanded(new Set());
    fetch(`/api/applications/${applicationId}/cv-preview?compare=1`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as CompareResponse;
        if (!cancelled) setState({ loading: false, data });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [applicationId, hasDocx]);

  const blocks = useMemo(() => (state.data?.compare ? toBlocks(state.data.compare.lines) : []), [state.data]);

  // TODO(status-model): quando arriverà lo stato `draft` (documenti generati
  // PRIMA dell'approvazione), questa vista diventa il passaggio obbligato
  // prima di `approved`. Oggi in modalità con conferma i documenti vengono
  // generati dopo l'approvazione, quindi qui li vedi appena sono pronti.
  if (!hasDocx) {
    return <div className="mat-preview-fallback"><FileDiff size={32} aria-hidden /><h3>{t("Modifiche non ancora disponibili", "Changes not available yet")}</h3><p>{t("Le differenze rispetto al tuo CV originale compaiono qui appena il CV su misura è pronto.", "Differences from your original CV appear here as soon as the tailored CV is ready.")}</p></div>;
  }
  if (state.loading) {
    return <div className="mat-preview-fallback"><FileDiff size={32} aria-hidden /><h3>{t("Confronto in corso…", "Comparing…")}</h3><p>{t("Stiamo confrontando il CV su misura con il tuo originale.", "Comparing the tailored CV with your original.")}</p></div>;
  }
  if (state.error || !state.data) {
    return <div className="mat-preview-fallback"><CircleAlert size={32} aria-hidden /><h3>{t("Confronto non disponibile", "Comparison unavailable")}</h3><p>{t("Non siamo riusciti ad aprire i documenti. Puoi comunque scaricare il CV dal pannello accanto.", "We couldn't open the documents. You can still download the CV from the side panel.")}</p></div>;
  }
  const compare = state.data.compare;
  if (!compare) {
    return <div className="mat-preview-fallback"><CircleAlert size={32} aria-hidden /><h3>{t("CV originale non trovato", "Original CV not found")}</h3><p>{t("Carica il tuo CV nelle impostazioni per vedere le differenze.", "Upload your CV in settings to see the differences.")}</p></div>;
  }

  return (
    <section className="cvd" aria-label={t("Modifiche rispetto al CV originale", "Changes from your original CV")}>
      <header className="cvd-head">
        <div>
          <h3>{t("Cosa è cambiato rispetto al tuo CV", "What changed from your CV")}</h3>
          <p>{t("Confronto con", "Compared with")} <strong>{compare.originalFilename}</strong></p>
        </div>
        <div className="cvd-counts" aria-label={t("Riepilogo modifiche", "Change summary")}>
          <span className="cvd-count cvd-count-add">+{compare.summary.added} <small>{t("righe nuove o riformulate", "new or reworded lines")}</small></span>
          <span className="cvd-count cvd-count-del">−{compare.summary.removed} <small>{t("righe non incluse", "lines left out")}</small></span>
        </div>
      </header>

      <div className="cvd-guard">
        <ShieldCheck size={18} aria-hidden />
        <p>{t("Datori di lavoro, ruoli, date e titoli di studio restano quelli del tuo CV. Cambia solo come sono scritti e in che ordine compaiono.", "Employers, job titles, dates and qualifications stay as they are in your CV. Only the wording and order change.")}</p>
      </div>

      {compare.yearsNotInOriginal.length > 0 && (
        <div className="cvd-warn" role="alert">
          <CircleAlert size={18} aria-hidden />
          <p>{t("Controlla queste date: non compaiono nel tuo CV originale", "Check these dates: they don't appear in your original CV")} ({compare.yearsNotInOriginal.join(", ")}). {t("Se non sono corrette, non approvare l’invio e scrivici.", "If they are wrong, don't approve the submission and contact us.")}</p>
        </div>
      )}

      <ol className="cvd-lines">
        {blocks.map((block, index) => {
          if (block.kind === "collapsed" && !expanded.has(index)) {
            return <li key={index} className="cvd-collapsed"><button type="button" onClick={() => setExpanded((prev) => new Set(prev).add(index))}>{t(`${block.count} righe invariate`, `${block.count} unchanged lines`)}</button></li>;
          }
          return block.lines.map((line, lineIndex) => (
            <li key={`${index}-${lineIndex}`} className={`cvd-line cvd-${line.op}`}>
              <span className="cvd-sign" aria-hidden>{line.op === "added" ? "+" : line.op === "removed" ? "−" : ""}</span>
              <span className="sr-only">{line.op === "added" ? t("Aggiunto: ", "Added: ") : line.op === "removed" ? t("Rimosso: ", "Removed: ") : ""}</span>
              <span className="cvd-text">{line.text}</span>
            </li>
          ));
        })}
      </ol>
      <p className="cvd-foot">{t("Il confronto è riga per riga sul testo estratto: la formattazione del documento finale può differire.", "The comparison is line by line on the extracted text: the final document's formatting may differ.")}</p>
    </section>
  );
}
