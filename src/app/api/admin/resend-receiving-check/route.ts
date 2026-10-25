import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/csrf";
import { authorizeEmailTestRequest } from "@/lib/email-test-capability";
import { checkResendReceivingCredential } from "@/lib/resend-keys";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Read-only receiving-key probe. Admin session (isAdmin + existing
 * authorizeEmailTestRequest GET pattern) or X-Admin-Key. GET only:
 * one Resend received-email fetch, no DB writes, never the key or
 * from/to/subject/body/headers/attachments.
 */
async function authorize(req: NextRequest) {
  const user = await getCurrentUser();
  return authorizeEmailTestRequest({
    headerKey: req.headers.get("x-admin-key"),
    userId: user?.id ?? null,
    isAdminUser: isAdmin(user?.email),
    originOk: checkOrigin(req),
    mutating: false,
  });
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const require = (url.searchParams.get("requireReceivingKey") ?? "").trim().toLowerCase();
  const result = await checkResendReceivingCredential({
    id: url.searchParams.get("id"),
    requireReceivingKey: require === "1" || require === "true" || require === "yes",
  });
  const status = result.error?.name === "receiving_key_required" ? 409
    : result.error?.name === "receiving_key_missing" ? 503
    : result.error?.name === "invalid_id" ? 400
    : 200;
  return NextResponse.json(result, { status });
}
