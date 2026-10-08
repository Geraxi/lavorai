import { NextResponse } from "next/server";
import { getPublicStats } from "@/lib/public-stats";

export const runtime = "nodejs";
export const revalidate = 30;

/**
 * Stats pubblici per landing: numeri REALI dal DB, no fake counters.
 * Il conteggio utenti è un COUNT SQL, non legge più l'intera tabella User.
 */
export async function GET() {
  const stats = await getPublicStats();
  return NextResponse.json(stats, {
    headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=30" },
  });
}
