import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { approveMailboxSends, sendApprovedMailbox } from "@/lib/mailbox/service";
import { realMailboxDeps } from "@/lib/mailbox/runtime";
import { resolveSendMode } from "@/lib/mailbox/send-guard";

const Body = z.object({ items: z.array(z.object({ id: z.string().min(1).max(64), recipient: z.string().email().max(254) })).min(1).max(25) });

export const maxDuration = 120;

/** GET: invii preparati in attesa di approvazione (elenco destinatari per l'utente). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sends = await prisma.mailboxSend.findMany({
    where: { userId: user.id, state: "prepared" }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, recipient: true, subject: true, fromAddress: true, provider: true, attachmentsJson: true, createdAt: true, application: { select: { job: { select: { title: true, company: true } } } } },
  });
  // Candidature con CV PDF e lettera pronti, non ancora inviate: candidabili alla preparazione.
  const eligible = await prisma.application.findMany({
    where: { userId: user.id, status: { in: ["ready_to_apply", "awaiting_consent", "needs_answers"] }, cvPdfPath: { not: null }, coverLetterText: { not: null }, mailboxSends: { none: { state: { not: "failed" } } } },
    orderBy: { createdAt: "desc" }, take: 50, select: { id: true, job: { select: { title: true, company: true } } },
  });
  const connection = await prisma.mailboxConnection.findFirst({ where: { userId: user.id, status: "active" }, select: { provider: true, email: true } });
  return NextResponse.json({ mode: resolveSendMode(), connection, eligible, sends: sends.map(({ attachmentsJson, ...s }) => ({ ...s, attachments: (JSON.parse(attachmentsJson) as { filename: string }[]).map((a) => a.filename) })) });
}

/** POST: approvazione esplicita (ogni destinatario confermato) + invio una-tantum. */
export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const deps = realMailboxDeps();
  const approval = await approveMailboxSends(user.id, parsed.data.items, deps);
  if (!approval.ok) return NextResponse.json({ error: approval.error }, { status: 409 });
  const results: Record<string, string> = {};
  for (const item of parsed.data.items) results[item.id] = await sendApprovedMailbox(item.id, user.id, deps);
  return NextResponse.json({ ok: true, mode: resolveSendMode(), results });
}
