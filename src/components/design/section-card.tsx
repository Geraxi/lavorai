import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SectionCard({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("ds-section-card", className)} style={style}>
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  icon,
  actions,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ds-section-head">
      <div className="ds-section-head-title">
        {icon}
        {title}
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function SectionBody({
  children,
  flush,
  className,
  style,
}: {
  children: ReactNode;
  flush?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("ds-section-body", flush && "flush", className)}
      style={style}
    >
      {children}
    </div>
  );
}
