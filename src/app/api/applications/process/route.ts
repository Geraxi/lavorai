import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const Schema = z.object({ applicationId: z.string().min(1) });

/**
 * Compatibility endpoint for queued application callbacks. Browser automation
 * runs only on Railway: this keeps Chromium out of Vercel function bundles.
 */
export async function POST(request: NextRequest) {
  const workerSecret = process.env.APP_WORKER_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const provided = request.headers.get("x-worker-secret");
  const authorized =
    (workerSecret && provided === workerSecret) ||
    (adminKey && provided === adminKey);
  if (!authorized) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Dev callbacks can be exercised without a configured worker secret.
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  console.log(`[queue] ${parsed.data.applicationId} acknowledged for Railway worker`);
  return NextResponse.json({ ok: true, queued: true });
}
