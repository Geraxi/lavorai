import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

export function Logo({ href = "/", className, size = "md" }: LogoProps) {
  const content = (
    <span
      className={cn(
        "font-bold tracking-tight text-foreground",
        sizes[size],
        className,
      )}
    >
      Lavor<span className="text-primary">AI</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="LavorAI — home" className="inline-flex">
      {content}
    </Link>
  );
}
