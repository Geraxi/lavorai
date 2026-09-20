"use client";

/** Small badge for inbox reply status on the applications list. */
export function ReplyKindChip({
  lastReplyKind,
  replyCount = 0,
}: {
  lastReplyKind?: string | null;
  replyCount?: number;
}) {
  const show =
    (lastReplyKind && ["colloquio", "risposta", "rifiutata"].includes(lastReplyKind)) ||
    replyCount > 0;
  if (!show) return null;

  const label =
    lastReplyKind === "colloquio"
      ? "Colloquio"
      : lastReplyKind === "rifiutata"
        ? "Rifiutata"
        : "Risposta";

  const background =
    lastReplyKind === "colloquio"
      ? "var(--primary-weak)"
      : lastReplyKind === "rifiutata"
        ? "hsl(0 70% 95%)"
        : "var(--bg-sunken)";

  const color =
    lastReplyKind === "colloquio"
      ? "hsl(var(--primary))"
      : lastReplyKind === "rifiutata"
        ? "var(--red, #b91c1c)"
        : "var(--fg-muted)";

  return (
    <span
      className="ds-chip"
      style={{ background, color, fontSize: 10.5, fontWeight: 600 }}
    >
      {label}
    </span>
  );
}
