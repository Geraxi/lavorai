import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";

export const runtime = "nodejs";
export const maxDuration = 30;

const Schema = z.object({
  // Se ids è omesso, rilascia TUTTE le awaiting_consent dell'utente
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
      ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
    },
    select: { id: true },
  });

  let enqueued = 0;
  for (const a of apps) {
    try {
      await prisma.application.update({
        where: { id: a.id },
        data: { status: "queued" },
      });
      await enqueueApplication(a.id);
      enqueued++;
    } catch (err) {
      console.error("[consent] enqueue failed for", a.id, err);
    }
  }
  return NextResponse.json({ ok: true, enqueued });
}
