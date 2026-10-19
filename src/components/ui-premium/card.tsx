import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Matte card with hairline border. `featured` adds the whisper-green edge. */
export function Card({
  children,
  className,
  featured,
  labelledBy,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  featured?: boolean;
  labelledBy?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={["pm-card", featured && "pm-card-featured", className].filter(Boolean).join(" ")} aria-labelledby={labelledBy}>
      {children}
    </Tag>
  );
}

export function CardHead({ id, icon: HeadIcon, title, actions }: { id?: string; icon?: LucideIcon; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pm-card-head">
      <h2 id={id}>
        {HeadIcon && <HeadIcon size={15} strokeWidth={1.75} aria-hidden />} {title}
      </h2>
      {actions}
    </header>
  );
}
