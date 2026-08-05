import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 45;

const MODEL = "claude-sonnet-5";

/**
 * POST /api/admin/assistant
 *
 * Assistente AI admin-only. Raccoglie uno snapshot live della
 * piattaforma (utenti reali vs test, candidature + verità consegna,
 * job pool, conversioni, email) e lo passa a Claude col messaggio
 * dell'admin. Risponde a domande operative/analitiche sui dati reali.
 *
 * Body: { messages: [{ role: "user"|"assistant", content: string }] }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const snapshot = await buildSnapshot();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ai_not_configured", message: "ANTHROPIC_API_KEY mancante." },
      { status: 503 },
    );
  }
  const client = new Anthropic({ apiKey });

  const system = `Sei l'assistente AI interno della dashboard admin di LavorAI (SaaS italiano di auto-apply per la ricerca lavoro, founder Umberto Geraci).

Rispondi a domande operative, analitiche e strategiche del founder usando lo SNAPSHOT live dei dati qui sotto. Sii diretto, onesto, concreto. Italiano. Se un dato non è nello snapshot, dillo chiaramente invece di inventare. Quando rilevi problemi (es. zero consegne confermate, zero conversioni, pool job fermo), evidenziali con franchezza e proponi azioni.

=== SNAPSHOT LIVE (${new Date().toISOString()}) ===
${snapshot}
=== FINE SNAPSHOT ===

Note di dominio:
- "Utenti reali" = esclusi account test (testmail.app, postdbpush-) e interni (founder, tester).
- "Consegna confermata" = candidatura con submitConfirmation DETECTED_HTTP/DOM (prova hard che è arrivata all'ATS). UNCONFIRMED/null = sospetta.
- Il problema noto #1 è che le candidature potrebbero non arrivare davvero (canary in corso).
- Tier: free / pro (€19.99) / pro_plus (€39.99).`;

  const anthropicMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 4000),
    }));

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0.3,
      system,
      messages: anthropicMessages,
    });
    const text = resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    return NextResponse.json({ ok: true, reply: text });
  } catch (err) {
    console.error("[admin/assistant]", err);
    return NextResponse.json(
      { error: "ai_error", message: err instanceof Error ? err.message : "AI failure" },
      { status: 500 },
    );
  }
}

/**
 * Raccoglie uno snapshot testuale compatto della piattaforma per dare
 * contesto a Claude. Stesse query della dashboard admin.
 */
async function buildSnapshot(): Promise<string> {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    allUsers,
    payingUsers,
    verifiedUsers,
    appsByStatus,
    appsByConfirmation,
    appsBySubmittedVia,
    totalApps,
    apps7d,
    deliveredMonth,
    jobsBySource,
    newestJob,
    emailsByKind7d,
    activeSessions,
    autoApplyModes,
  ] = await Promise.all([
    prisma.user.findMany({ select: { email: true, tier: true, emailVerified: true, createdAt: true, _count: { select: { applications: true } } } }),
    prisma.user.count({ where: { tier: { in: ["pro", "pro_plus"] } } }),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submitConfirmation"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submittedVia"], _count: { _all: true } }),
    prisma.application.count(),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.application.count({ where: { status: "success", submittedVia: { not: null }, createdAt: { gte: monthStart } } }),
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true } }),
    prisma.emailLog.groupBy({ by: ["kind"], where: { createdAt: { gte: since(24 * 7) } }, _count: { _all: true } }),
    prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
    prisma.userPreferences.groupBy({ by: ["autoApplyMode"], _count: { _all: true } }),
  ]);

  const real = allUsers.filter((u) => !isTestAccount(u.email));
  const realPaying = real.filter((u) => u.tier === "pro" || u.tier === "pro_plus").length;
  const real7d = real.filter((u) => u.createdAt >= since(24 * 7)).length;
  const real30d = real.filter((u) => u.createdAt >= since(24 * 30)).length;
  const realList = real
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((u) => `${u.email} (${u.tier}, ${u._count.applications} apps, ${u.createdAt.toISOString().slice(0, 10)})`);

  const confMap = Object.fromEntries(appsByConfirmation.map((r) => [r.submitConfirmation ?? "null", r._count._all]));
  const confirmed = Object.entries(confMap).filter(([k]) => k.startsWith("DETECTED")).reduce((s, [, v]) => s + v, 0);

  return [
    `UTENTI: ${allUsers.length} totali, ${real.length} reali (test/interni esclusi), ${verifiedUsers} verificati.`,
    `  Reali nuovi: 7g=${real7d}, 30g=${real30d}. Paganti reali: ${realPaying}. Paganti totali (incl interni): ${payingUsers}.`,
    `  Lista utenti reali: ${realList.length ? realList.join("; ") : "nessuno"}`,
    ``,
    `CANDIDATURE: ${totalApps} totali, ${apps7d} ultimi 7g, ${deliveredMonth} consegnate questo mese.`,
    `  Per status: ${appsByStatus.map((r) => `${r.status}=${r._count._all}`).join(", ")}`,
    `  Per submitConfirmation: ${appsByConfirmation.map((r) => `${r.submitConfirmation ?? "null"}=${r._count._all}`).join(", ")}`,
    `  Per submittedVia: ${appsBySubmittedVia.map((r) => `${r.submittedVia ?? "null"}=${r._count._all}`).join(", ")}`,
    `  Consegna confermata HARD (DETECTED_*): ${confirmed}. ${confirmed === 0 && totalApps > 0 ? "⚠️ ZERO consegne confermate!" : ""}`,
    ``,
    `JOB POOL: ${jobsBySource.map((r) => `${r.source}=${r._count._all}`).join(", ") || "vuoto"}.`,
    `  Job più recente cached: ${newestJob?.cachedAt ? newestJob.cachedAt.toISOString() : "mai"}.`,
    ``,
    `EMAIL 7g: ${emailsByKind7d.map((r) => `${r.kind}=${r._count._all}`).join(", ") || "nessuna"}.`,
    `AUTO-APPLY mode utenti: ${autoApplyModes.map((r) => `${r.autoApplyMode}=${r._count._all}`).join(", ") || "nessuna pref"}.`,
    `SESSIONI attive: ${activeSessions}.`,
  ].join("\n");
}
