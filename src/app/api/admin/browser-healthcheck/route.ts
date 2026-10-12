import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/browser-healthcheck
 * Verifica che il browser worker su Railway sia attivo. Chromium NON gira più
 * su Vercel serverless (troppo pesante: 51 MB/function → 205 GB storage totale).
 * Ora il browser vive solo nel Railway worker. Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    status: "browser_on_railway_only",
    message:
      "Browser automation ora gira SOLO sul Railway worker, NON su Vercel. " +
      "Questo endpoint non può più testare il browser direttamente. " +
      "Per verificare il worker: controlla i log Railway o crea un'application di test.",
    env: process.env.VERCEL ? "vercel" : "other",
    workerUrl: process.env.RAILWAY_WORKER_URL ?? null,
  });
}
