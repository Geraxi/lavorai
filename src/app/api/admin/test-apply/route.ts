import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { processApplication } from "@/lib/application-worker";
import { findPortalAdapter } from "@/lib/portal-adapters";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/test-apply
 * Esegue UNA candidatura end-to-end DIRETTAMENTE su Vercel (in-process,
 * bypassando la coda BullMQ) per verificare che l'intero pipeline —
 * generazione CV + adapter ATS + Chromium — funzioni su serverless.
 *
 * Sicurezza: con PORTAL_SUBMIT_DRY_RUN=true il form viene compilato ma NON
 * inviato (confirmation=DRY_RUN). Nessuna candidatura reale parte.
 *
 * Body opzionale: { applicationId }. Se assente, sceglie una candidatura
 * ready_to_apply del founder su un portale supportato (greenhouse/ashby/…).
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { applicationId?: string; realSubmit?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // body opzionale
  }

  // Invio reale SOLO se richiesto esplicitamente: override chirurgico del
  // dry-run per questa singola candidatura (non tocca il flag globale).
  const forceRealSubmit = body.realSubmit === true;
  const dryRun = forceRealSubmit
    ? false
    : process.env.PORTAL_SUBMIT_DRY_RUN === "true";
  const portalEnabled = process.env.PORTAL_SUBMIT_ENABLED !== "false";

  // Trova la candidatura da testare.
  let appId = body.applicationId?.trim();
  if (!appId) {
    // Auto-pick: una ready_to_apply del founder su portale con adapter.
    const candidates = await prisma.application.findMany({
      where: {
        userId: user!.id,
        status: { in: ["ready_to_apply", "failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, job: { select: { url: true, title: true, company: true } } },
    });
    // Solo job con adapter ATS e ancora ONLINE: un annuncio chiuso (es.
    // Greenhouse → redirect a ?error=true o alla career page) produce un
    // form_not_found che non dice nulla sullo stato della pipeline.
    const withAdapter = candidates.filter((c) => findPortalAdapter(c.job.url)).slice(0, 15);
    let match: (typeof candidates)[number] | undefined;
    const skipped: string[] = [];
    for (const c of withAdapter) {
      if (await isJobUrlAlive(c.job.url)) { match = c; break; }
      skipped.push(`${c.job.company ?? "?"} · ${c.job.title}`);
    }
    if (!match && skipped.length > 0) {
      return NextResponse.json({
        ok: false,
        message: `Le ${skipped.length} candidature ATS più recenti puntano ad annunci non più online (${skipped.slice(0, 3).join(" | ")}${skipped.length > 3 ? " | …" : ""}). Passa un applicationId di un annuncio ancora aperto.`,
      });
    }
    if (!match) {
      return NextResponse.json({
        ok: false,
        message:
          "Nessuna candidatura ready_to_apply su un portale supportato (greenhouse/ashby/lever/…). Passa un applicationId esplicito.",
      });
    }
    appId = match.id;
  }

  const before = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, job: { select: { url: true, title: true, company: true } } },
  });
  if (!before) {
    return NextResponse.json({ ok: false, message: "Application non trovata." }, { status: 404 });
  }
  const adapter = findPortalAdapter(before.job.url);

  const t0 = Date.now();
  let runError: string | null = null;
  try {
    await processApplication(appId, { forceRealSubmit });
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
  }

  const after = await prisma.application.findUnique({
    where: { id: appId },
    select: {
      status: true,
      submittedVia: true,
      submitConfirmation: true,
      errorMessage: true,
      canaryLog: true,
      atsScore: true,
    },
  });

  // Marker del test admin dentro canaryLog (merge, non sovrascrive la
  // diagnostica dell'adapter): la card "Ultimo test" in /admin/automation
  // legge QUESTO, non l'ultima candidatura qualsiasi.
  try {
    let existing: Record<string, unknown> = {};
    try { existing = after?.canaryLog ? (JSON.parse(after.canaryLog) as Record<string, unknown>) : {}; } catch { existing = { raw: after?.canaryLog }; }
    await prisma.application.update({
      where: { id: appId },
      data: {
        canaryLog: JSON.stringify({
          ...existing,
          adminTest: {
            at: new Date().toISOString(),
            dryRun,
            realSubmit: forceRealSubmit,
            adapter: adapter?.id ?? null,
            status: after?.status ?? null,
            submitConfirmation: after?.submitConfirmation ?? null,
            error: runError ?? after?.errorMessage ?? null,
            ms: Date.now() - t0,
          },
        }),
      },
    });
  } catch (err) {
    console.warn("[test-apply] marker adminTest non salvato", err);
  }

  return NextResponse.json({
    ok: !runError,
    dryRun,
    portalEnabled,
    applicationId: appId,
    job: `${before.job.title}${before.job.company ? ` @ ${before.job.company}` : ""}`,
    adapter: adapter?.id ?? "(nessuno — andrà via email/fallback)",
    ms: Date.now() - t0,
    runError,
    result: {
      status: after?.status,
      submittedVia: after?.submittedVia,
      submitConfirmation: after?.submitConfirmation,
      atsScore: after?.atsScore,
      errorMessage: after?.errorMessage,
      canaryCaptured: !!after?.canaryLog,
      canaryExcerpt: after?.canaryLog?.slice(0, 600) ?? null,
    },
  });
}

/**
 * Verifica leggera che l'annuncio sia ancora online: segue i redirect e
 * considera "morto" un 404/410, o (per gli ATS) un redirect verso la lista
 * generica del board (Greenhouse: ...?error=true, /<slug> senza /jobs/<id>)
 * o verso la career page aziendale.
 */
async function isJobUrlAlive(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36" } });
    clearTimeout(t);
    if (res.status === 404 || res.status === 410) return false;
    const final = res.url || url;
    if (/[?&]error=true/i.test(final)) return false;
    const wasAts = /greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|smartrecruiters\.com/i.test(url);
    if (wasAts) {
      const finalIsAts = /greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|smartrecruiters\.com/i.test(final);
      if (!finalIsAts) return false; // redirect alla career page custom → l'adapter non troverà il form
      if (/greenhouse\.io\/[^/]+\/?$/i.test(final)) return false; // tornato alla lista del board
    }
    return res.ok;
  } catch {
    return true; // in dubbio non escludiamo (timeout/rete): lo scoprirà l'adapter
  }
}
