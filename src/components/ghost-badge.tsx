import { Ghost } from "lucide-react";
import { GHOST_LEVEL_LABEL, ghostSummary, type GhostJobResult } from "@/lib/ghost-job";

const TONE: Record<GhostJobResult["level"], string> = {
  basso: "tone-green",
  medio: "tone-amber",
  alto: "tone-red",
  dati_insufficienti: "tone-neutral",
};

/**
 * Badge "annuncio fantasma": mostrato solo per rischio medio/alto o dati
 * insufficienti; il rischio basso resta silenzioso salvo `showLow`.
 * Le motivazioni sono nel tooltip/aria-label, sempre trasparenti.
 */
export function GhostBadge({ result, showLow = false }: { result: GhostJobResult; showLow?: boolean }) {
  if (result.level === "basso" && !showLow) return null;
  const summary = ghostSummary(result);
  return (
    <span className={`pm-pill ghost-pill ${TONE[result.level]}`} title={summary} aria-label={summary}>
      <Ghost size={12} strokeWidth={1.75} aria-hidden /> {result.level === "dati_insufficienti" ? "Dati insufficienti" : GHOST_LEVEL_LABEL[result.level].replace("Rischio", "Fantasma:")}
    </span>
  );
}

/** Elenco esteso delle motivazioni (pagina dettaglio). */
export function GhostReasons({ result }: { result: GhostJobResult }) {
  return (
    <div className="ghost-reasons">
      <GhostBadge result={result} showLow />
      <ul>{(result.reasons.length ? result.reasons : ["Nessun segnale di rischio"]).map((r) => <li key={r}>{r}</li>)}</ul>
      {result.missing.length > 0 && result.level !== "dati_insufficienti" && <small>Non valutato: {result.missing.join(", ")}</small>}
    </div>
  );
}
