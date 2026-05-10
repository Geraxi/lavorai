"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const marketingLinks = [
    { href: "/#come-funziona", label: t("howItWorks") },
    { href: "/#prezzi", label: t("pricing") },
    { href: "/#faq", label: t("faq") },
  ];
  const appLinks = [
    { href: "/jobs", label: "Job board" },
    { href: "/applications", label: t("dashboard") },
  ];
  const isApp =
    pathname?.startsWith("/jobs") ||
    pathname?.startsWith("/applications") ||
    pathname?.startsWith("/onboarding");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = isApp ? appLinks : marketingLinks;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-300",
        scrolled || isApp
          ? "border-b border-border/50 bg-background/80 backdrop-blur-xl shadow-lg shadow-background/10"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className="flex items-center justify-between"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "0 40px",
          height: 76,
        }}
      >
        <Logo size="lg" />

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => {
            const active =
              isApp &&
              (link.href === pathname ||
                (link.href !== "/" && pathname?.startsWith(link.href)));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md transition-colors",
                  active
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
                style={{
                  padding: "10px 16px",
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isApp ? (
            <Button
              asChild
              variant="outline"
              style={{ height: 44, paddingLeft: 18, paddingRight: 18, fontSize: 15 }}
            >
              <Link href="/onboarding/cv">Aggiorna CV</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className="hidden sm:inline-flex"
                style={{ height: 44, paddingLeft: 18, paddingRight: 18, fontSize: 15 }}
              >
                <Link href="/login">{t("login")}</Link>
              </Button>
              <Button
                asChild
                className="group"
                style={{ height: 44, paddingLeft: 22, paddingRight: 22, fontSize: 15 }}
              >
                <Link href="/signup">
                  <span style={{ fontWeight: 600 }}>{t("signup")}</span>
                </Link>
              </Button>
            </>
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
