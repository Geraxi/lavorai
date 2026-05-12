"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { Separator } from "@/components/ui/separator";

export function SiteFooter() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");

  const linkGroups = [
    {
      title: t("product"),
      links: [
        { href: "/optimize", label: t("optimizeCv") },
        { href: "/#prezzi", label: tNav("pricing") },
        { href: "/#come-funziona", label: tNav("howItWorks") },
        { href: "/#faq", label: tNav("faq") },
      ],
    },
    {
      title: t("legal"),
      links: [
        { href: "/privacy", label: t("privacy") },
        { href: "/termini", label: t("terms") },
        { href: "/contatti", label: t("contact") },
      ],
    },
  ];

  return (
    <footer className="relative border-t border-white/10 bg-black/20 backdrop-blur-3xl">
      <div className="container py-16">
        <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
          <div className="max-w-sm space-y-4">
            <Logo size="lg" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("tagline")}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              <span>{t("hostedIn")}</span>
            </div>
          </div>

          {linkGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
                {group.title}
              </div>
              <nav className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 LavorAI · P.IVA 01452520776</p>
          <p className="text-muted-foreground/60">{t("builtWith")}</p>
        </div>
      </div>
    </footer>
  );
}
