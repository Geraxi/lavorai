import Link from "next/link";
import { Logo } from "@/components/logo";
import { Separator } from "@/components/ui/separator";

const linkGroups = [
  {
    title: "Prodotto",
    links: [
      { href: "/optimize", label: "Ottimizza CV" },
      { href: "/#prezzi", label: "Prezzi" },
      { href: "/#come-funziona", label: "Come funziona" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Legale",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/termini", label: "Termini" },
      { href: "/contatti", label: "Contatti" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border/60 bg-background">
      <div className="container py-16">
        <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
          <div className="max-w-sm space-y-4">
            <Logo size="lg" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Il copilota italiano per la ricerca del lavoro. Carica il CV,
              imposta le preferenze, LavorAI candida in automatico per te.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              <span>Hosted in Frankfurt · GDPR compliant</span>
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
          <p>© 2026 LavorAI · P.IVA 01452520776 · Made in Italy 🇮🇹</p>
          <p className="text-muted-foreground/60">
            Built with Next.js, Claude AI · Shipped in Italy.
          </p>
        </div>
      </div>
    </footer>
  );
}
