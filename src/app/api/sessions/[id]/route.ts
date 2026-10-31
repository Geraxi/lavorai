import {replaceCompletedSession} from "@/lib/replace-application-session";
import {applicationRolloutConfig} from "@/lib/application-rollout";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  status: z.enum(["active", "paused", "cancelled", "auto"]).optional(),
  acknowledgeCompleted: z.boolean().optional(),
  newRound: z.boolean().optional(),
});

/**
 * PATCH /api/sessions/[id] — cambia stato (pause/resume/cancel) o
 * marca come visto un round completato (così il prompt dashboard sparisce).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if(parsed.data.newRound){
    if(parsed.data.status||parsed.data.acknowledgeCompleted)return NextResponse.json({error:'validation'},{status:400});
    const result=await replaceCompletedSession(prisma,user.id,id,applicationRolloutConfig().startedAt);
    return NextResponse.json(result.ok?result:{...result,message:'Impossibile creare un nuovo round: verifica lo stato e il numero di ricerche attive.'},{status:result.ok?200:result.error==='not_found'?404:409});
  }
  const s = await prisma.applicationSession.findUnique({
    where: { id },
    select: { userId: true, status: true, completedAt:true,sentCount:true,targetCount:true },
  });
  if (!s || s.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if(['active','auto'].includes(parsed.data.status??'')&&(s.completedAt||['completed','cancelled'].includes(s.status)||s.sentCount>=s.targetCount))return NextResponse.json({error:'session_complete',message:'Il round è concluso. Crea una nuova ricerca: lo storico e i contatori non vengono azzerati.'},{status:409});
  const data: {
    status?: string;
    completedAcknowledgedAt?: Date;
    completedAt?: Date | null;
  } = {};
  if (parsed.data.status) {
    // "auto" legacy → "active"
    data.status = parsed.data.status === "auto" ? "active" : parsed.data.status;
    if (data.status === "cancelled") {
      data.completedAt = new Date();
    }
  }
  if (parsed.data.acknowledgeCompleted) {
    data.completedAcknowledgedAt = new Date();
  }
  if(data.status==='active'){
    const updated=await prisma.applicationSession.updateMany({where:{id,userId:user.id,status:s.status,completedAt:null,sentCount:{lt:s.targetCount},targetCount:s.targetCount},data});
    if(updated.count!==1)return NextResponse.json({error:'session_changed',message:'Il round è cambiato. Aggiorna la pagina prima di continuare.'},{status:409});
  }else await prisma.applicationSession.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const s = await prisma.applicationSession.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!s || s.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Soft-delete: status=cancelled. Le candidature collegate restano in
  // DB con sessionId valido (per audit + non perdere risultati).
  await prisma.applicationSession.update({
    where: { id },
    data: { status: "cancelled", completedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
