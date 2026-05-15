import { redirect } from "next/navigation";
import { AppShell } from "@/components/design/app-shell";
import { CommandPalette } from "@/components/design/command-palette";
import { ThemeScript } from "@/components/design/theme-script";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier } from "@/lib/billing";

/**
 * App layout. Strippato delle 2 prisma.count() che giravano su OGNI
 * navigazione (bloccanti pre-paint, 200-500ms felt latency).
 * I conteggi sidebar ora fluiscono via client SWR a /api/sidebar-stats
 * dopo il primo paint — navigazione tra pagine è istantanea, badge si
 * popolano subito dopo.
 *
 * Resta solo getCurrentUser() (session lookup, già cached da NextAuth)
 * + effectiveTier() (pure function) prima del render.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    if (process.env.AUTH_SECRET) redirect("/login");
    return null;
  }

  const tier = effectiveTier(user);

  return (
    <>
      <ThemeScript />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-[hsl(var(--foreground))] focus:px-3 focus:py-2 focus:text-[hsl(var(--background))]"
      >
        Vai al contenuto principale
      </a>
      <AppShell
        sidebarProps={{
          // Conteggi NON forniti dal server: la sidebar fetcha
          // /api/sidebar-stats via SWR dopo il primo paint.
          userName: user.name ?? user.email.split("@")[0],
          userPlan:
            tier === "pro_plus"
              ? "Piano Pro+"
              : tier === "pro"
                ? "Piano Pro"
                : "Piano Free",
        }}
      >
        {children}
      </AppShell>
      <CommandPalette />
    </>
  );
}
