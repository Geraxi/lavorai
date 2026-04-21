"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const marketingLinks = [
  { href: "/#come-funziona", label: "Come funziona" },
  { href: "/#prezzi", label: "Prezzi" },
  { href: "/#faq", label: "FAQ" },
];

const appLinks = [
  { href: "/jobs", label: "Job board" },
  { href: "/applications", label: "Candidature" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
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
      <div className="container flex h-16 items-center justify-between">
        <Logo size="md" />

        <nav className="hidden items-center gap-1 md:flex">
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
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {isApp ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/onboarding/cv">Aggiorna CV</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="group">
              <Link href="/jobs">
                <span>Prova demo</span>
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
