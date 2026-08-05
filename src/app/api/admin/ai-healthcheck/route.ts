import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-sonnet-5";

/**
 * GET /api/admin/ai-healthcheck
 * Verifica IN PRODUZIONE che la chiave ANTHROPIC_API_KEY del server sia
 * valida e che l'account abbia crediti — facendo una chiamata reale minima.
 * Risponde con lo stato esatto così sappiamo se il pipeline può generare CV.
 * Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      status: "no_key",
      message: "ANTHROPIC_API_KEY non impostata in produzione.",
    });
  }
  // Maschera la chiave per conferma visiva (prefisso/suffisso).
  const keyHint = `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (len ${apiKey.length})`;

  const t0 = Date.now();
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    const text =
      res.content?.[0]?.type === "text" ? res.content[0].text : "(no text)";
    return NextResponse.json({
      ok: true,
      status: "credits_ok",
      message: "Chiave valida e crediti disponibili.",
      keyHint,
      reply: text.trim(),
      ms: Date.now() - t0,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const low = raw.toLowerCase();
    let status = "error";
    if (low.includes("credit balance") || low.includes("insufficient"))
      status = "no_credits";
    else if (low.includes("authentication") || low.includes("invalid x-api-key") || low.includes("401"))
      status = "invalid_key";
    return NextResponse.json({
      ok: false,
      status,
      message:
        status === "no_credits"
          ? "Crediti esauriti: ricarica su console.anthropic.com → Billing."
          : status === "invalid_key"
            ? "La chiave ANTHROPIC_API_KEY in produzione NON è valida (diversa/revocata)."
            : "Errore nella chiamata Anthropic.",
      keyHint,
      raw: raw.slice(0, 300),
      ms: Date.now() - t0,
    });
  }
}
