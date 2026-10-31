import { applicationRolloutConfig, rolloutCreationBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { applicationPrerequisiteBlock } from "@/lib/application-prerequisites";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { createLivenessGate, livenessMaxChecksFromEnv } from "@/lib/auto-apply-liveness-gate";
import { checkJobUrlLiveness, JOB_CLOSED_HELD_MESSAGE, markJobClosed } from "@/lib/job-liveness";

export const runtime = "nodejs";
export const maxDuration = 30;

const Schema = z.object({
  // Without ids, release only this user's new, untouched rollout cohort.
  ids: z.array(z.string().min(1)).max(100).optional(),
});

/**
 * POST /api/applications/consent
 * Rilascia le candidature in stato "awaiting_consent" → "queued" + enqueue.
 * Usato dal flow hybrid: l'utente preme "Consenti" per autorizzare l'invio.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (applicationsPaused()) {
    return NextResponse.json({ error: "applications_paused", message: "Invii temporaneamente in pausa per manutenzione." }, { status: 503 });
  }
  if (rolloutCreationBlocked()) {
    return NextResponse.json({ error: "application_rollout_closed" }, { status: 503 });
  }
  const config = applicationRolloutConfig();
  if (!config.enabled || !config.startedAt) return NextResponse.json({ error: "application_rollout_closed" }, { status: 503 });
  const prerequisite = applicationPrerequisiteBlock(user);
  if (prerequisite) return NextResponse.json(prerequisite.body, { status: prerequisite.status });
  const cohort = {
    createdAt: { gt: config.startedAt, lte: new Date() },
    startedAt: null, completedAt: null, consentGrantedAt: null, retryCount: 0,
    submittedAt: null, submittedVia: null, submitConfirmation: null,
    canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
  };
  const body = await request.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const apps = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: "awaiting_consent",
      ...cohort,
      ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
    },
    select: { id: true, sessionId:true, session:{select:{userId:true,status:true,completedAt:true,sentCount:true,targetCount:true}}, job: { select: { id: true, url: true } } },
  });
  const blocked=apps.find(a=>a.sessionId&&(!a.session||a.session.userId!==user.id||!['active','auto'].includes(a.session.status)||a.session.completedAt||a.session.sentCount>=a.session.targetCount));
  if(blocked)return NextResponse.json({error:'session_inactive',message:'Apri Preferenze → Round: riprendi la ricerca in pausa oppure scegli Nuovo round se conclusa. Nessuna candidatura selezionata è stata accodata.',redirect:'/preferences?tab=rounds&sessionId='+encodeURIComponent(blocked.sessionId!)},{status:409});

  // Bounded pre-consent liveness check: a closed posting is never queued.
  const gate = createLivenessGate({ check: checkJobUrlLiveness, markClosed: markJobClosed, maxChecks: livenessMaxChecksFromEnv() });
  let enqueued = 0;
  let closed = 0;
  for (const a of apps) {
    try {
      if (rolloutCreationBlocked()) break;
      if (await gate.verdict(a.job) === "closed") {
        const marked = await prisma.application.updateMany({
          where: { id: a.id, userId: user.id, status: "awaiting_consent", ...cohort },
          data: { status: "failed", submitConfirmation: "JOB_CLOSED", completedAt: new Date(), errorMessage: JOB_CLOSED_HELD_MESSAGE },
        });
        closed += marked.count;
        continue;
      }
      const changed = await prisma.application.updateMany({
        where: { id: a.id, userId: user.id, status: "awaiting_consent", ...cohort,
          OR:[{sessionId:null},{session:{is:{userId:user.id,status:{in:['active','auto']}}}}] },
        data: { status: "queued", consentGrantedAt: new Date() },
      });
      if (changed.count !== 1) continue;
      await enqueueApplication(a.id, { preserveClaim: true });
      enqueued++;
    } catch (err) {
      console.error("[consent] enqueue failed for", a.id, err);
    }
  }
  return NextResponse.json({ ok: true, enqueued, closed });
}
