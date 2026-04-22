import { redirect } from "next/navigation";
import { AppShell } from "@/components/design/app-shell";
import { CommandPalette } from "@/components/design/command-palette";
import { ThemeScript } from "@/components/design/theme-script";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier } from "@/lib/billing";

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

  const [applicationsCount, todayCount] = await Promise.all([
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  const tier = effectiveTier(user);
  const dailyCap = tier === "free" ? 3 : tier === "pro" ? 50 : 100;

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
          applicationsCount,
          autoApplyToday: todayCount,
          autoApplyRemaining: Math.max(0, dailyCap - todayCount),
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
