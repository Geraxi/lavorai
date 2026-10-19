import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/**
 * Calm, card-style app-wide notice (onboarding step, consent, coverage…).
 * Hairline card, neutral icon chip, one action. No colour floods.
 */
export function Notice({
  id,
  icon: NoticeIcon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { href: string; label: string; primary?: boolean };
  tone?: "neutral" | "amber";
}) {
  return (
    <div role="status" className={`pm-notice tone-${tone}`} data-notice={id}>
      <span className="pm-chip-icon"><NoticeIcon size={14} strokeWidth={1.75} aria-hidden /></span>
      <div className="pm-notice-text">
        <strong>{title}</strong>
        {body && <span>{body}</span>}
      </div>
      {action && (
        <Link href={action.href} className={action.primary ? "pm-btn-primary" : "pm-btn-ghost"}>
          {action.label} <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      )}
    </div>
  );
}
