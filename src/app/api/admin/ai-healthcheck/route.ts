import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.OPENAI_MODEL_FAST ?? "gpt-5.6-luna";

/**
 * GET /api/admin/ai-healthcheck
 * Verifica IN PRODUZIONE che la chiave OPENAI_API_KEY del server sia
 * valida e che l'account abbia crediti — facendo una chiamata reale minima.
 * Risponde con lo stato esatto così sappiamo se il pipeline può generare CV.
 * Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      status: "no_key",
      message: "OPENAI_API_KEY non impostata in produzione.",
    });
  }
  // Maschera la chiave per conferma visiva (prefisso/suffisso).
  const keyHint = `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (len ${apiKey.length})`;

  const t0 = Date.now();
  try {
    const client = new OpenAI({ apiKey });
    const res = await client.responses.create({
      model: MODEL,
      max_output_tokens: 32,
      store: false,
      input: "Reply with exactly: OK",
    });
    const text = res.output_text || "(no text)";
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
    if (low.includes("credit balance") || low.includes("insufficient") || low.includes("quota"))
      status = "no_credits";
    else if (low.includes("authentication") || low.includes("invalid api key") || low.includes("401"))
      status = "invalid_key";
    return NextResponse.json({
      ok: false,
      status,
      message:
        status === "no_credits"
          ? "Crediti o quota OpenAI esauriti: controlla Platform → Billing."
          : status === "invalid_key"
            ? "La chiave OPENAI_API_KEY in produzione NON è valida (diversa/revocata)."
            : "Errore nella chiamata OpenAI.",
      keyHint,
      raw: raw.slice(0, 300),
      ms: Date.now() - t0,
    });
  }
}
