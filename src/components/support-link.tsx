"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
export function SupportLink({ compact = false }: { compact?: boolean }) {
  const en = useLocale() === "en";
  return <p className={compact ? "text-xs" : "mt-5 text-center text-sm"}><Link href="/feedback" prefetch={false} className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">{compact ? (en ? "Feedback & bugs" : "Feedback e bug") : (en ? "Feedback & bugs — no subscription required" : "Feedback e bug — anche senza abbonamento")}</Link></p>;
}
