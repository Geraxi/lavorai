import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifyResendWebhook } from "@/lib/resend-webhook-signature";
import { DELIVERY_EVENT_STATUS, recordApplicationDeliveryEvent } from "@/lib/application-delivery";
import { processInboundReply, type InboundEmail } from "@/lib/application-reply-processing";

export const runtime = "nodejs";

/** Acknowledge only after durable processing. Provider retries repair failures. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!process.env.RESEND_WEBHOOK_SECRET && !(process.env.NODE_ENV === "development" && process.env.RESEND_ALLOW_UNSIGNED_WEBHOOKS === "1")) {
    return NextResponse.json({ error: "webhook_unconfigured" }, { status: 503 });
  }
  if (!verifyResendWebhook(request.headers, raw)) return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  if (raw.length > 1_000_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let event: { type: string; created_at?: string; data: InboundEmail & { tags?: Record<string, string> | Array<{ name: string; value: string }> } };
  try {
    event = JSON.parse(raw);
    if (!event || typeof event.type !== "string" || !event.data || typeof event.data !== "object") throw new Error("invalid_event");
  } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const inbound = ["email.received", "inbound.email", "email.inbound"].includes(event.type);
  const outbound = Object.hasOwn(DELIVERY_EVENT_STATUS, event.type) || event.type === "email.opened";
  if (!inbound && !outbound) return NextResponse.json({ ok: true, ignored: true });
  if (typeof event.data.email_id !== "string" || !event.data.email_id.trim()) return NextResponse.json({ error: "missing_email_id" }, { status: 400 });
  if (inbound) {
    for (const key of ["from", "subject", "text", "html"] as const) {
      if (event.data[key] != null && typeof event.data[key] !== "string") return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const to = event.data.to;
    if (to != null && typeof to !== "string" && !(Array.isArray(to) && to.every((x) => typeof x === "string"))) return NextResponse.json({ error: "invalid_recipient" }, { status: 400 });
  }
  const occurredAt = event.created_at ? new Date(event.created_at) : new Date();
  if (!Number.isFinite(occurredAt.getTime())) return NextResponse.json({ error: "invalid_event_date" }, { status: 400 });
  // Only explicit local development accepts a derived unsigned event identity.
  const providerEventId = request.headers.get("svix-id") ?? `dev:${createHash("sha256").update(raw).digest("hex")}`;
  try {
    if (inbound) {
      const result = await processInboundReply({ data: event.data, providerEventId, receivedAt: occurredAt });
      return NextResponse.json({ ok: true, matched: result.matched });
    }
    const tags = event.data.tags;
    const attemptId = Array.isArray(tags) ? tags.find((tag) => tag?.name === "attempt_id")?.value : tags?.attempt_id;
    const recipients = Array.isArray(event.data.to) ? event.data.to : typeof event.data.to === "string" ? [event.data.to] : [];
    await recordApplicationDeliveryEvent({ providerEventId, providerEmailId: event.data.email_id, type: event.type, occurredAt,
      ...(typeof attemptId === "string" && recipients.every((address) => typeof address === "string") ? { attemptId, recipients } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Do not swallow errors: 2xx here would permanently lose a message or retry.
    // Never log body, sender, provider response or security-code content.
    console.error("[webhook/resend] durable_processing_failed");
    return NextResponse.json({ error: "processing_retry_required" }, { status: 500 });
  }
}
