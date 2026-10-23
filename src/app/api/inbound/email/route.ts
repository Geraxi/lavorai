import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { INBOUND_PROVIDERS } from "@/lib/inbound/providers";
import { processUserInboundEmail } from "@/lib/inbound/service";
import { inboundAiClassifier } from "@/lib/inbound/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Inbound mail for per-user addresses (<slug>@INBOUND_USER_DOMAIN).
 * Provider-agnostic (?provider=, default "resend"); Resend signature verified
 * with RESEND_INBOUND_SECRET. 2xx only after durable storage so the provider
 * retries failures. Never logs bodies, senders or codes. Never sends mail.
 */
export async function POST(request: NextRequest) {
  const provider = INBOUND_PROVIDERS[request.nextUrl.searchParams.get("provider") ?? "resend"];
  if (!provider) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  if (!process.env.RESEND_INBOUND_SECRET && !(process.env.NODE_ENV === "development" && process.env.INBOUND_ALLOW_UNSIGNED === "1")) {
    return NextResponse.json({ error: "webhook_unconfigured" }, { status: 503 });
  }
  if (!provider.verify(request.headers, raw, process.env)) return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  let mail;
  try { mail = provider.parse(raw); } catch { return NextResponse.json({ error: "bad_payload" }, { status: 400 }); }
  if (!mail) return NextResponse.json({ ok: true, ignored: true });
  try {
    const hydrated = await provider.hydrate(mail, process.env);
    const r = await processUserInboundEmail(hydrated, { db: prisma, env: process.env, ai: inboundAiClassifier() });
    return NextResponse.json({ ok: true, stored: r.stored, duplicates: r.duplicates, ignored: r.unknownRecipient, confirmed: r.confirmed.length });
  } catch (e) {
    console.error(`[inbound/email] ${provider.name} processing failed: ${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`);
    return NextResponse.json({ error: "processing_retry_required" }, { status: 500 });
  }
}
