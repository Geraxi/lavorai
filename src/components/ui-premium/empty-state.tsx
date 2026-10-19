import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: EmptyIcon, title, text, cta }: { icon: LucideIcon; title: string; text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="pm-empty">
      <span className="pm-empty-icon"><EmptyIcon size={18} strokeWidth={1.75} aria-hidden /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {cta && <Link href={cta.href} className="pm-btn-ghost">{cta.label}</Link>}
    </div>
  );
}
