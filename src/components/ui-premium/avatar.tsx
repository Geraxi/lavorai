/** Neutral initials avatar (no external logo fetches, no loud colours). */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "·";
  return (
    <span className="pm-avatar" style={size !== 30 ? { width: size, height: size } : undefined} aria-hidden>
      {initials}
    </span>
  );
}
