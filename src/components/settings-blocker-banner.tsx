import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { blockerCopy, type BlockerResult } from "@/lib/settings-blocker-nudge";

/**
 * Dashboard banner for Pro/trial users whose own settings stop applications.
 * Rendered only when getSettingsBlockerForUser returns a blocker (flag
 * SETTINGS_NUDGE_ENABLED=true). It only links into the app; it changes nothing.
 */
export function SettingsBlockerBanner({ result, locale }: { result: BlockerResult; locale: string }) {
  const copy = blockerCopy(result, locale);
  return (
    <section className="pm-card pm-card-featured dash-next" role="status" aria-labelledby="dash-settings-blocker-title" data-settings-blocker={result.blocker}>
      <div className="dash-next-body">
        <div className="dash-next-text">
          <div className="pm-eyebrow"><CircleAlert size={13} strokeWidth={2} aria-hidden /> {copy.eyebrow}</div>
          <h2 id="dash-settings-blocker-title">{copy.title}</h2>
          {copy.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
        <Link href={copy.cta.href} className="pm-btn-primary">
          {copy.cta.label} <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
