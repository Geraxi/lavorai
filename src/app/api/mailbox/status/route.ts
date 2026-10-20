import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveSendMode } from "@/lib/mailbox/send-guard";
import { providerConfigured } from "@/lib/mailbox/oauth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const connections = await prisma.mailboxConnection.findMany({ where: { userId: user.id }, select: { provider: true, email: true, status: true, updatedAt: true } });
  return NextResponse.json({ connections, mode: resolveSendMode(), configured: { gmail: providerConfigured("gmail"), outlook: providerConfigured("outlook") } });
}
