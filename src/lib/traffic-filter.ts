import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { HUMAN_PAGEVIEW_WHERE } from "@/lib/bot-filter";

/**
 * `where` Prisma per le metriche di traffico "umano e reale":
 *   1. esclude bot/crawler via user-agent (HUMAN_PAGEVIEW_WHERE, vale anche sullo storico);
 *   2. esclude le visite degli account interni/di test (stesso `isTestAccount` della pagina
 *      "Utenti reali": founder/admin, tester, domini e prefissi di test), sia per userId sia per
 *      ogni sessionId che quegli account hanno mai usato (le loro visite anonime sullo stesso device).
 *
 * Uso: `where: { ...(await humanPageViewWhere()), ts: { gte } }` — il frammento usa solo `AND`.
 * Chiamalo una volta per richiesta e riusa il risultato nelle query in parallelo.
 */
export async function humanPageViewWhere(): Promise<Prisma.PageViewWhereInput> {
  const and: Prisma.PageViewWhereInput[] = [...HUMAN_PAGEVIEW_WHERE.AND];
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    const internalIds = users.filter((u) => isTestAccount(u.email)).map((u) => u.id);
    if (internalIds.length > 0) {
      const internalSessions = await prisma.pageView
        .findMany({
          where: { userId: { in: internalIds }, sessionId: { not: null } },
          distinct: ["sessionId"],
          select: { sessionId: true },
          take: 5000,
        })
        .then((rows) => rows.map((r) => r.sessionId).filter((s): s is string => Boolean(s)))
        .catch(() => [] as string[]);
      // NOT IN su colonna nullable esclude anche i NULL in SQL: serve l'OR esplicito.
      and.push({ OR: [{ userId: null }, { userId: { notIn: internalIds } }] });
      if (internalSessions.length > 0) {
        and.push({ OR: [{ sessionId: null }, { sessionId: { notIn: internalSessions } }] });
      }
    }
  } catch {
    // Best-effort: se la lookup fallisce restiamo almeno col filtro bot.
  }
  return { AND: and };
}
