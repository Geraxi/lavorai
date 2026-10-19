import { Dot } from "./pill";
import type { Tone } from "./tone";

export interface StatusSegment {
  key: string;
  label: string;
  count: number;
  tone: Tone;
}

/** Thin segmented bar (6px) + legend with shares. Segments with 0 are dropped. */
export function StatusBar({ segments, showShare = true }: { segments: StatusSegment[]; showShare?: boolean }) {
  const shown = segments.filter((s) => s.count > 0);
  const total = shown.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  return (
    <div className="pm-statusbar-wrap">
      <div className="pm-statusbar" role="img" aria-label={shown.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {shown.map((s) => <span key={s.key} className={`tone-${s.tone}`} style={{ flexGrow: s.count }} />)}
      </div>
      <ul className="pm-legend" aria-hidden>
        {shown.map((s) => (
          <li key={s.key} className={`tone-${s.tone}`}>
            <Dot tone={s.tone} />{s.label}<b>{showShare ? `${Math.round((s.count / total) * 100)}%` : s.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
