import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PreferencesClient } from "./preferences-client";

export const metadata: Metadata = { title: "Preferenze" };
export const dynamic = "force-dynamic";

function safeArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function PreferencesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [prefs, full] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avoidCompanies: true },
    }),
  ]);

  const modes = safeArray(prefs?.sourcesJson ?? "[]");

  const initial = {
    roles: safeArray(prefs?.rolesJson ?? "[]"),
    locations: safeArray(prefs?.locationsJson ?? "[]"),
    salaryMin: prefs?.salaryMin ?? 30,
    autoApplyOn: prefs?.autoApplyOn ?? true,
    dailyCap: prefs?.dailyCap ?? 25,
    matchMin: prefs?.matchMin ?? 75,
    modeSel: {
      remoto: modes.includes("remoto"),
      ibrido: modes.includes("ibrido"),
      sede: modes.includes("sede"),
    },
    excludedCompanies: (full?.avoidCompanies ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  return <PreferencesClient initial={initial} />;
}
