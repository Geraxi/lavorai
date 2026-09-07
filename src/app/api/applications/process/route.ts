import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { processApplication } from "@/lib/application-worker";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min: Claude + DOCX + optional Playwright

const Schema = z.object({ applicationId: z.string().min(1) });

/**
 * Endpoint chiamato dalla queue (QStash/Inngest) per processare una
 * candidatura in background. Protegge con shared secret header se
 * configurato — altrimenti rifiuta in prod.
 *
 * Per chiamanti legittimi in dev: include header `x-worker-secret: <APP_WORKER_SECRET>`
 */
export async function POST(request: NextRequest) {
  // Accetta APP_WORKER_SECRET (originale) O ADMIN_SYNC_KEY (fallback
  // usato dal self-invoke serverless in application-queue.ts). Uno
  // dei due DEVE matchare in produzione.
  const workerSecret = process.env.APP_WORKER_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const provided = request.headers.get("x-worker-secret");
  const authorized =
    (workerSecret && provided === workerSecret) ||
    (adminKey && provided === adminKey);
  if (!authorized) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // dev: permetti chiamate senza secret per test locale
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  try {
    // Precedenza al worker Railway (browser Playwright completo, nessun limite
    // di 300s): questo fallback serverless aspetta PROCESS_FALLBACK_DELAY_MS
    // (default 45s, > intervallo di polling del worker) e prende in carico
    // solo ciò che il worker non ha già preso. Evita anche decine di browser
    // serverless in parallelo (ETXTBSY / "browser has been closed").
    const delay = Math.max(0, Number(process.env.PROCESS_FALLBACK_DELAY_MS ?? 45_000) || 0);
    if (delay > 0 && process.env.NODE_ENV === "production") await new Promise((r) => setTimeout(r, delay));
    // Claim atomico: se il worker Railway l'ha già presa (polling DB), qui non facciamo nulla.
    const { claimApplication } = await import("@/lib/application-claim");
    if (!(await claimApplication(parsed.data.applicationId))) {
      console.log(`[/api/applications/process] ${parsed.data.applicationId} già presa in carico altrove, skip`);
      return NextResponse.json({ ok: true, skipped: true });
    }
    await processApplication(parsed.data.applicationId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/applications/process]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "errore" },
      { status: 500 },
    );
  }
}
