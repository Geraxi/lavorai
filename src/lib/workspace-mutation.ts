import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { isApplicationAccessPaused, requiresPaymentMethodBeforeApp } from "@/lib/billing";

export class WorkspaceError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
/** Same access boundary as Inbox replies. Never accepts an owner from the client. */
export async function workspaceOwner(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new WorkspaceError("invalid_origin", 403);
  return workspaceReadOwner();
}
export async function workspaceReadOwner() {
  const session = await auth();
  if (!session?.user?.id) throw new WorkspaceError("unauthenticated", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, suspendedAt: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true, stripeSubscriptionId: true, subscriptionStatus: true } });
  if (!user) throw new WorkspaceError("unauthenticated", 401);
  if (user.suspendedAt) throw new WorkspaceError("account_access_required", 403);
  if (!isAdmin(user.email) && (isApplicationAccessPaused(user) || requiresPaymentMethodBeforeApp(user))) throw new WorkspaceError("account_access_required", 403);
  return user.id;
}
export async function smallJson(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new WorkspaceError("invalid_payload", 415);
  const reader = request.body?.getReader(); if (!reader) throw new WorkspaceError("invalid_payload");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1024) { await reader.cancel(); throw new WorkspaceError("payload_too_large", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new WorkspaceError("invalid_payload"); }
}
export function workspaceError(error: unknown) {
  return NextResponse.json({ error: error instanceof WorkspaceError ? error.code : "service_unavailable" }, { status: error instanceof WorkspaceError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
