import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOneClick } from "@/lib/one-click-token";
import { NUDGE_KINDS } from "@/lib/consent-questions-nudge";
import { TRIAL_EXTENSION_KIND } from "@/lib/trial-extension";
import { SETTINGS_NUDGE_KIND } from "@/lib/settings-blocker-nudge";

const OPTOUT_KINDS = [...NUDGE_KINDS, TRIAL_EXTENSION_KIND, SETTINGS_NUDGE_KIND] as const;
type NudgeKind = (typeof OPTOUT_KINDS)[number];

export const runtime = "nodejs";

/**
 * Opt-out from one service nudge kind (privacy consent / pending questions /
 * trial extension). Opting out of the trial-extension email never revokes the week.
 * GET shows a confirmation button only (link scanners must not opt users out);
 * POST (the button, or RFC 8058 List-Unsubscribe=One-Click) records optedOutAt.
 * The signed token is the authorisation. It changes nothing else: no consent,
 * no applications, no other notification.
 */
function parse(request: NextRequest): { userId: string; kind: NudgeKind } | null {
  const kind = request.nextUrl.searchParams.get("k") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!(OPTOUT_KINDS as readonly string[]).includes(kind)) return null;
  const verified = verifyOneClick(token, `nudge-optout:${kind}`);
  return verified ? { userId: verified.userId, kind: kind as NudgeKind } : null;
}

function page(title: string, body: string, form?: string): NextResponse {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F1012;">
<div style="max-width:520px;margin:0 auto;padding:48px 24px;">
<div style="font-size:18px;font-weight:700;margin-bottom:28px;">Lavor<span style="color:#1FA97A;">AI</span></div>
<h1 style="font-size:22px;margin:0 0 12px;">${title}</h1><p style="font-size:15px;line-height:1.6;color:#3A3C40;">${body}</p>${form ?? ""}
</div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const LABEL: Record<NudgeKind, string> = {
  privacy_consent: "i promemoria sul consenso privacy",
  pending_questions: "i promemoria sulle domande in attesa",
  trial_extension: "le email sulla settimana di prova extra",
  settings_blocker: "i promemoria sulle impostazioni che bloccano le candidature",
};

export async function GET(request: NextRequest) {
  const parsed = parse(request);
  if (!parsed) return page("Link non valido o scaduto", "Puoi gestire tutto da Impostazioni nell’app.");
  const action = `${request.nextUrl.pathname}?${request.nextUrl.searchParams.toString()}`.replace(/"/g, "&quot;");
  return page(
    `Disattivare ${LABEL[parsed.kind]}?`,
    parsed.kind === TRIAL_EXTENSION_KIND
      ? "Non riceverai più queste email. La settimana di prova già concessa resta attiva."
      : "Non riceverai più queste email. Le candidature in attesa restano ferme finché non agisci nell’app.",
    `<form method="post" action="${action}"><button type="submit" style="background:#0F1012;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer;">Disattiva</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  const parsed = parse(request);
  if (!parsed) return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: parsed.userId }, select: { id: true } });
  if (user) {
    await prisma.userNudge.upsert({
      where: { userId_kind: { userId: parsed.userId, kind: parsed.kind } },
      create: { userId: parsed.userId, kind: parsed.kind, optedOutAt: new Date() },
      update: { optedOutAt: new Date() },
    });
  }
  return page("Fatto", `Non riceverai più ${LABEL[parsed.kind]}.`);
}
