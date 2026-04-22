import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/resend
 * Riceve eventi Resend: email.opened, email.delivered, email.clicked, ecc.
 *
 * Setup: in Resend dashboard → Webhooks → aggiungi URL + copia la signing secret
 * come RESEND_WEBHOOK_SECRET su Vercel env.
 *
 * L'email inviata al recruiter deve avere il header "x-lavorai-app-id"
 * (settato lato worker) — lo leggiamo dall'evento per mappare al record.
 */

interface ResendEvent {
  type: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    headers?: Record<string, string>;
    // campi custom aggiunti via resend.emails.send tags/headers
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
  };
}

function verify(signature: string | null, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // in dev se non settato, accetta
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // signature format "sha256=<hex>" o diretto — gestiamo entrambi
  const got = signature.replace(/^sha256=/, "");
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function appIdFromEvent(data: ResendEvent["data"]): string | null {
  // Priorità: custom header → tags
  const headers = data.headers ?? {};
  const h =
    headers["x-lavorai-app-id"] ??
    headers["X-Lavorai-App-Id"] ??
    headers["X-LavorAI-App-Id"];
  if (typeof h === "string") return h;
  if (Array.isArray(data.tags)) {
    const t = data.tags.find((x) => x.name === "app_id");
    return t?.value ?? null;
  }
  if (data.tags && typeof data.tags === "object" && "app_id" in data.tags) {
    return (data.tags as Record<string, string>).app_id ?? null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature =
    request.headers.get("resend-signature") ??
    request.headers.get("x-resend-signature") ??
    request.headers.get("svix-signature");

  if (!verify(signature, raw)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Eventi che ci interessano
  if (event.type === "email.opened") {
    const appId = appIdFromEvent(event.data);
    if (appId) {
      try {
        const app = await prisma.application.findUnique({
          where: { id: appId },
          select: { viewedAt: true, userStatus: true },
        });
        if (app && !app.viewedAt) {
          await prisma.application.update({
            where: { id: appId },
            data: {
              viewedAt: new Date(),
              userStatus: app.userStatus ?? "vista",
            },
          });
        }
      } catch (err) {
        console.error("[webhook/resend] update failed", err);
      }
    }
  }

  // Accetta tutto, anche eventi non gestiti — 200 per evitare retry Resend
  return NextResponse.json({ ok: true });
}
