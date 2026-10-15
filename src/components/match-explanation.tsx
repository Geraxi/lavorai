import type { MatchExplanation as Explanation } from "@/lib/match-explanation";
export function MatchExplanation({ explanation, en }: { explanation: Explanation; en: boolean }) {
  return <section className="workspace-panel match-explanation"><h2>{en ? "Why this role?" : "Perché questo ruolo?"}</h2>
    <p className="workspace-muted">{en ? "The score estimates text overlap with your CV. It is not a hiring probability or a complete requirement check." : "Il punteggio stima la corrispondenza testuale con il CV. Non è una probabilità di assunzione né una verifica completa dei requisiti."}</p>
    <h3>{en ? "CV skills mentioned" : "Competenze del CV citate"}</h3><p>{!explanation.hasProfile ? (en ? "Upload a CV to compare." : "Carica un CV per confrontare.") : explanation.matchedSkills.join(" · ") || (en ? "No exact skill mentions found." : "Nessuna competenza citata esattamente.")}</p>
    {!!explanation.missingEvidence.length && <><h3>{en ? "Required skills without CV evidence" : "Competenze richieste senza riscontro nel CV"}</h3><p>{explanation.missingEvidence.join(" · ")}</p><small>{en ? "Check or update your CV; absence is not proof you lack the skill." : "Verifica o aggiorna il CV: l'assenza non prova che manchi la competenza."}</small></>}
    <h3>{en ? "Requirements to verify in the listing" : "Requisiti da verificare nell'annuncio"}</h3>{explanation.requirements.length ? explanation.requirements.map((text, i) => <blockquote key={i}>{text}</blockquote>) : <p>{en ? "No explicit requirement extracted. Read the full listing; this does not mean there are no requirements." : "Nessun requisito esplicito estratto. Leggi l'annuncio completo: non significa che non ci siano requisiti."}</p>}
  </section>;
}
