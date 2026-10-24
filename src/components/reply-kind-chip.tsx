"use client";

/** Stored classifications are heuristic; old counters can include automated mail. */
export function ReplyKindChip({ lastReplyKind, replyCount = 0, locale = "it" }: {
  locale?: string;
  lastReplyKind?: string | null;
  replyCount?: number;
}) {
  if (!lastReplyKind && replyCount <= 0) return null;
  const en = locale === "en";
  const label = (en ? {
    colloquio: "Possible interview", risposta: "Possible reply", rifiutata: "Possible rejection",
    ricevuta: "Automatic receipt", auto: "Automated message", auto_reply: "Automatic reply (not a rejection)",
    redirected_to_portal: "Apply on the portal (not a rejection)", bounce: "Delivery failure",
  } : {
    colloquio: "Possibile colloquio", risposta: "Possibile risposta", rifiutata: "Possibile rifiuto",
    ricevuta: "Ricevuta automatica", auto: "Messaggio automatico", auto_reply: "Risposta automatica (non è un rifiuto)",
    redirected_to_portal: "Candidati sul portale (non è un rifiuto)", bounce: "Mancata consegna",
  } as Record<string, string>)[lastReplyKind ?? ""] ?? (en ? "Message received" : "Messaggio ricevuto");

  return (
    <span className="ds-chip"
      title={en ? "Automatic classification. Historical counts may include automated messages: verify the content in your inbox." : "Classificazione automatica. Il conteggio storico può includere messaggi automatici: verifica il contenuto nell'Inbox."}
      style={{ background: "var(--bg-sunken)", color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 600 }}>
      {label}
    </span>
  );
}
