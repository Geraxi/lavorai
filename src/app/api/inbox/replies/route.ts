import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isApplicationAccessPaused, requiresPaymentMethodBeforeApp } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { getReplyContext, publicReply, saveInboxDraft, sendInboxReply } from "@/lib/inbox-replies";
import { InboxReplyError } from "@/lib/inbox-reply-policy";

export const runtime = "nodejs";
const payload = z.object({ id: z.string().uuid(), parentId: z.string().regex(/^application_reply:[a-zA-Z0-9_-]{1,100}$/),
  body: z.string().trim().min(1).max(10000).refine(value => !value.includes("\0")), action: z.enum(["draft", "send"]) }).strict();
async function owner() {
  const session = await auth();
  if (!session?.user?.id) throw new InboxReplyError("unauthenticated", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new InboxReplyError("unauthenticated", 401);
  if (!isAdmin(user.email) && (isApplicationAccessPaused(user) || requiresPaymentMethodBeforeApp(user))) throw new InboxReplyError("account_access_required", 403);
  return user.id;
}
function errorResponse(error: unknown) {
  const known = error instanceof InboxReplyError;
  return NextResponse.json({ error: known ? error.code : "reply_service_unavailable" }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: NextRequest) {
  try {
    const userId = await owner();
    const context = await getReplyContext(userId, request.nextUrl.searchParams.get("parentId") ?? "");
    return NextResponse.json({ recipient: context.recipient, subject: context.subject }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    // Cookie-authenticated mutation: require exact origin (including protocol), even in development.
    if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new InboxReplyError("invalid_origin", 403);
    const userId = await owner();
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InboxReplyError("invalid_payload", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new InboxReplyError("invalid_payload");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); throw new InboxReplyError("message_too_long", 413); } chunks.push(value); }
    let json: unknown;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new InboxReplyError("invalid_payload"); }
    const parsed = payload.safeParse(json);
    if (!parsed.success) throw new InboxReplyError("invalid_payload");
    const draft = await saveInboxDraft(userId, parsed.data);
    const row = parsed.data.action === "send" ? await sendInboxReply(userId, draft.id) : draft;
    return NextResponse.json({ reply: publicReply(row) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new InboxReplyError("invalid_origin", 403);
    const userId = await owner();
    const id = request.nextUrl.searchParams.get("id");
    if (!z.string().uuid().safeParse(id).success) throw new InboxReplyError("invalid_payload");
    const deleted = await prisma.inboxReply.deleteMany({ where: { id: id!, status: "draft", application: { userId } } });
    if (!deleted.count) throw new InboxReplyError("draft_unavailable", 404);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
