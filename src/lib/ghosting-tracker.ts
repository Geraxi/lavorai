/**
 * Tracking onesto: "nessuna risposta recruiter" dopo N giorni.
 * 
 * Molti ATS non mandano MAI risposta automatica. Invece di fingere
 * successo o nascondere, mostriamo all'utente la realtà: "Inviata",
 * poi dopo X giorni senza reply → "Nessuna risposta dopo N giorni"
 * (ghosted). Mai forgiamo email fake "rifiutata".
 */

export interface GhostingStatus {
  status: "sent" | "replied" | "ghosted";
  daysSinceSubmit: number;
  label: string; // Italiano UI
  badgeColor: "green" | "yellow" | "gray";
}

const GHOSTING_THRESHOLD_DAYS = 7;

export function computeGhostingStatus(app: {
  status: string;
  submittedAt: Date | null;
  lastReplyAt: Date | null;
  replyCount: number;
  submitConfirmation: string | null;
}): GhostingStatus | null {
  // Solo per candidature inviate con successo
  if (app.status !== "success") return null;
  if (!app.submittedAt) return null; // submittedAt popolato SOLO per confirmed

  const now = new Date();
  const daysSince = Math.floor(
    (now.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Risposta ricevuta dal recruiter
  if (app.replyCount > 0 && app.lastReplyAt) {
    return {
      status: "replied",
      daysSinceSubmit: daysSince,
      label: "Risposta ricevuta",
      badgeColor: "green",
    };
  }

  // Nessuna risposta entro threshold → ghosted
  if (daysSince >= GHOSTING_THRESHOLD_DAYS) {
    return {
      status: "ghosted",
      daysSinceSubmit: daysSince,
      label: `Nessuna risposta (${daysSince}g)`,
      badgeColor: "gray",
    };
  }

  // Inviata recentemente, attesa normale
  return {
    status: "sent",
    daysSinceSubmit: daysSince,
    label: daysSince === 0 ? "Inviata oggi" : `Inviata ${daysSince}g fa`,
    badgeColor: "yellow",
  };
}

export function getGhostingFilterCopy(): {
  all: string;
  sent: string;
  ghosted: string;
  replied: string;
} {
  return {
    all: "Tutte le inviate",
    sent: "In attesa risposta",
    ghosted: `Nessuna risposta (>${GHOSTING_THRESHOLD_DAYS}g)`,
    replied: "Con risposta",
  };
}

export function getGhostingExplanation(): string {
  return (
    `Molti ATS non inviano MAI conferma o risposta automatica. ` +
    `Se non ricevi risposta entro ${GHOSTING_THRESHOLD_DAYS} giorni, è normale — ` +
    `non significa rifiuto. Alcuni recruiter rispondono dopo settimane. ` +
    `Se vuoi sollecitare, usa il pulsante "Invia follow-up".`
  );
}
