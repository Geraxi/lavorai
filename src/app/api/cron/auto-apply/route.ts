import { NextResponse, type NextRequest } from "next/server";
import { runAutoApplyCron } from "@/lib/auto-apply-cron";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron — invocato ogni 2 ore.
 * Scova e accoda candidature per gli utenti in modalità autoApplyMode="auto".
 *
 * Auth: Vercel manda "Authorization: Bearer <CRON_SECRET>" se settato;
 * accetta anche X-Admin-Key per run manuali.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("authorization");
  const xAdmin = request.headers.get("x-admin-key");
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (adminKey && xAdmin === adminKey);

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const stats = await runAutoApplyCron();
    const ms = Date.now() - t0;
    console.log(`[cron/auto-apply] ${ms}ms`, stats);
    return NextResponse.json({ ok: true, ms, ...stats });
  } catch (err) {
    console.error("[cron/auto-apply]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
