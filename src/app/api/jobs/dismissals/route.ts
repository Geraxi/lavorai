import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { workspaceOwner, smallJson, WorkspaceError, workspaceError } from "@/lib/workspace-mutation";
const payload = z.object({ jobId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), action: z.enum(["dismiss", "restore"]) }).strict();
export async function POST(request: NextRequest) {
  try {
    const userId = await workspaceOwner(request);
    const parsed = payload.safeParse(await smallJson(request)); if (!parsed.success) throw new WorkspaceError("invalid_payload");
    const { jobId, action } = parsed.data;
    if (action === "restore") await prisma.jobDismissal.deleteMany({ where: { userId, jobId } });
    else {
      if (!await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } })) throw new WorkspaceError("job_unavailable", 404);
      await prisma.jobDismissal.upsert({ where: { userId_jobId: { userId, jobId } }, create: { userId, jobId }, update: {} });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return workspaceError(error); }
}
