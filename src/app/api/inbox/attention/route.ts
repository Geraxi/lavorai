import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { workspaceOwner, smallJson, WorkspaceError, workspaceError } from "@/lib/workspace-mutation";
const payload = z.object({ id: z.string().regex(/^(application_reply|gmail):[a-zA-Z0-9_-]{1,100}$/), action: z.enum(["read", "handled", "reopen", "tomorrow"]) }).strict();
export async function POST(request: NextRequest) {
  try {
    const userId = await workspaceOwner(request);
    const parsed = payload.safeParse(await smallJson(request));
    if (!parsed.success) throw new WorkspaceError("invalid_payload");
    const [source, id] = parsed.data.id.split(":"); const now = new Date();
    const data = parsed.data.action === "read" ? (source === "gmail" ? { read: true } : { readAt: now })
      : parsed.data.action === "handled" ? { handledAt: now, remindAt: null }
      : parsed.data.action === "tomorrow" ? { handledAt: null, remindAt: new Date(now.getTime() + 86400_000) }
      : { handledAt: null, remindAt: null };
    const result = source === "gmail"
      ? await prisma.gmailMessage.updateMany({ where: { id, userId }, data })
      : await prisma.applicationReply.updateMany({ where: { id, application: { userId }, isSecurityCode: false }, data });
    if (!result.count) throw new WorkspaceError("message_unavailable", 404);
    return NextResponse.json({ ok: true, state: parsed.data.action === "read" ? { read: true } : data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return workspaceError(error); }
}
