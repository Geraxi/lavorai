import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { prepareMailboxSends } from "@/lib/mailbox/service";
import { realMailboxDeps } from "@/lib/mailbox/runtime";

const Body = z.object({ applicationIds: z.array(z.string().min(1).max(64)).min(1).max(50) });

/** Prepara (NON invia) le email di candidatura dalla casella dell'utente. */
export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  return NextResponse.json(await prepareMailboxSends(user.id, parsed.data.applicationIds, realMailboxDeps()));
}
