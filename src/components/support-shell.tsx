import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeScript } from "@/components/design/theme-script";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { reportCopy } from "@/lib/feedback";
import "@/components/ui-premium/premium.css";
import "./feedback.css";

/** A support-only shell: no sidebar stats, popups or paid-feature fetches. */
export function SupportShell({ locale, children }: { locale: string; children: React.ReactNode }) {
  const c = reportCopy(locale);
  return <div className="support-shell pm-scope"><ThemeScript />
    <a className="sr-only focus:not-sr-only" href="#main-content">{locale === "en" ? "Skip to content" : "Vai al contenuto"}</a>
    <nav className="support-nav" aria-label={c.title}><Link href="/dashboard" prefetch={false} className="support-back"><ArrowLeft size={14} aria-hidden />{locale === "en" ? "Back to LavorAI" : "Torna a LavorAI"}</Link><ThemeToggle locale={locale === "en" ? "en" : "it"} /></nav>
    <main id="main-content">{children}</main>
  </div>;
}
