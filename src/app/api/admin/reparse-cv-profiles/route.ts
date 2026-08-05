import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { extractFullProfile } from "@/lib/cv-profile-ai-full";
import { profileToRow } from "@/lib/cv-profile-types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Ri-parsa il CVProfile per tutti gli utenti che hanno un CVDocument
 * ma il cvProfile è vuoto (firstName == "" o cvProfile inesistente).
 * Fallout comune quando l'API AI era rotta: gli utenti hanno caricato
 * il CV ma il parse ha fallito silenziosamente lasciando profile vuoti.
 *
 * Auth: sessione admin loggata.
 * Body opzionale: { onlyEmail?, includeTest?, limit? }
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const headerKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (expected && headerKey === expected) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const onlyEmail: string | undefined = body?.onlyEmail?.trim() || undefined;
  const includeTest: boolean = body?.includeTest === true;
  const limit = Math.max(1, Math.min(100, Number(body?.limit) || 50));

  // Trova utenti con CV ma profile vuoto (o inesistente)
  const users = await prisma.user.findMany({
    where: {
      cvDocuments: { some: {} },
      OR: [
        { cvProfile: null },
        { cvProfile: { firstName: "" } },
        { cvProfile: { firstName: "-" } },
      ],
      ...(onlyEmail ? { email: onlyEmail } : {}),
    },
    select: {
      id: true,
      email: true,
      cvDocuments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { extractedText: true },
      },
    },
    take: limit,
  });

  const targets = includeTest ? users : users.filter((u) => !isTestAccount(u.email));

  const results: Array<{ email: string; status: string; profile?: string }> = [];
  let processed = 0;
  let failed = 0;

  for (const u of targets) {
    const text = u.cvDocuments[0]?.extractedText;
    if (!text || text.length < 50) {
      results.push({ email: u.email, status: "skip: no_text" });
      continue;
    }
    try {
      const profile = await extractFullProfile(text);
      if (!profile.firstName && !profile.lastName && !profile.title) {
        results.push({ email: u.email, status: "skip: empty_extract" });
        failed++;
        continue;
      }
      const row = profileToRow(profile);
      await prisma.cVProfile.upsert({
        where: { userId: u.id },
        create: { userId: u.id, ...row },
        update: row,
      });
      results.push({
        email: u.email,
        status: "ok",
        profile: `${profile.firstName} ${profile.lastName} · ${profile.title || "(no title)"} · ${profile.experiences?.length ?? 0} exp`,
      });
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ email: u.email, status: `error: ${msg.slice(0, 100)}` });
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    found: targets.length,
    processed,
    failed,
    results,
  });
}
