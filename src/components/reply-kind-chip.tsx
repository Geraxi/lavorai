"use client";

/** Stored classifications are heuristic; old counters can include automated mail. */
export function ReplyKindChip({ lastReplyKind, replyCount = 0 }: {
  lastReplyKind?: string | null;
  replyCount?: number;
}) {
  if (!lastReplyKind && replyCount <= 0) return null;
  const label = ({
    colloquio: "Possibile colloquio", risposta: "Possibile risposta", rifiutata: "Possibile rifiuto",
    ricevuta: "Ricevuta automatica", auto: "Messaggio automatico", bounce: "Mancata consegna",
  } as Record<string, string>)[lastReplyKind ?? ""] ?? "Messaggio ricevuto";

  return (
    <span className="ds-chip"
      title="Classificazione automatica. Il conteggio storico può includere messaggi automatici: verifica il contenuto nell'Inbox."
      style={{ background: "var(--bg-sunken)", color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 600 }}>
      {label}
    </span>
  );
}
