import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { sendWithinQuota } from "@/lib/email-quota";
import { signOneClick } from "@/lib/one-click-token";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/broadcast-auto-apply?dry=1
 * Email one-shot a tutti gli utenti NON in modalità full-auto: spiega
 * cosa cambia e dà un link one-click per attivarla (rilascia anche le
 * candidature ferme in "awaiting_consent"). Solo admin. Una sola volta
 * per utente (EmailLog kind=auto_apply_invite).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

  const users = await prisma.user.findMany({
    where: { suspendedAt: null, emailVerified: { not: null } },
    select: { id: true, email: true, name: true, locale: true, preferences: { select: { autoApplyMode: true } }, _count: { select: { applications: { where: { status: "awaiting_consent" } } } } },
  });
  const already = new Set((await prisma.emailLog.findMany({ where: { kind: "auto_apply_invite" }, select: { to: true } })).map((l) => l.to.toLowerCase()));
  const targets = users.filter((u) => !isTestAccount(u.email) && !isAdmin(u.email) && u.preferences?.autoApplyMode !== "auto" && !already.has(u.email.toLowerCase()));

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  const details: { email: string; waiting: number; status: string }[] = [];
  let sent = 0;
  for (const u of targets) {
    const waiting = u._count.applications;
    if (dry || !resend) { details.push({ email: u.email, waiting, status: dry ? "dry_run" : "no_resend_key" }); continue; }
    const link = `${site}/api/preferences/activate-auto?t=${signOneClick(u.id, "activate_auto")}`;
    const { subject, html, text } = render(u, waiting, link, site);
    try {
      const r = await sendWithinQuota("auto_apply_invite", u.email, async () => {
        const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>", to: u.email, subject, html, text });
        if (error) throw new Error(JSON.stringify(error));
      });
      details.push({ email: u.email, waiting, status: r.sent ? "sent" : r.reason ?? "skipped" });
      if (r.sent) sent++;
    } catch (err) {
      details.push({ email: u.email, waiting, status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?") });
    }
  }
  return NextResponse.json({ ok: true, dry, candidates: targets.length, sent, details });
}

function render(u: { name: string | null; locale: string | null }, waiting: number, link: string, site: string) {
  const en = u.locale === "en";
  const first = u.name?.trim().split(/\s+/)[0];
  const greet = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : en ? "Hi," : "Ciao,";
  const subject = waiting > 0
    ? en ? `${waiting} applications are ready and waiting for you` : `${waiting} candidature pronte ti stanno aspettando`
    : en ? "Let LavorAI apply for you every day" : "Lascia che LavorAI si candidi per te ogni giorno";
  const btn = `<a href="${link}" style="display:inline-block;padding:12px 20px;background:#16A34A;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">${en ? "Turn on auto-apply" : "Attiva l'auto-apply"}</a>`;
  const bodyIt = `<p>${greet}</p>
<p>Il tuo account è in modalità <strong>con conferma</strong>: LavorAI trova le offerte e prepara la candidatura, ma non parte finché non torni a cliccare "Consenti". ${waiting > 0 ? `In questo momento hai <strong>${waiting} candidature pronte</strong> ferme in attesa.` : "Risultato: molte candidature restano ferme."}</p>
<p>Con la modalità <strong>automatica</strong> LavorAI invia ogni giorno le candidature compatibili con il tuo profilo, con CV e lettera su misura, e ti avvisa via email di quello che ha fatto. Puoi tornare indietro in qualsiasi momento dalle Preferenze.</p>
<p>${btn}</p>
<p style="color:#64748B;font-size:12.5px;">Il link attiva la modalità automatica e fa ripartire subito le candidature in attesa. Se preferisci decidere una per una, non fare nulla: tutto resta com'è. Preferenze: <a href="${site}/preferences" style="color:#64748B;">${site}/preferences</a></p>`;
  const bodyEn = `<p>${greet}</p>
<p>Your account is in <strong>confirm mode</strong>: LavorAI finds the jobs and prepares the application, but nothing is sent until you come back and click "Allow". ${waiting > 0 ? `Right now <strong>${waiting} applications</strong> are ready and waiting.` : "Result: many applications never leave."}</p>
<p>In <strong>automatic mode</strong> LavorAI applies every day to the jobs matching your profile, with a tailored CV and cover letter, and emails you a summary. You can switch back any time from Preferences.</p>
<p>${btn}</p>
<p style="color:#64748B;font-size:12.5px;">The link turns automatic mode on and releases the waiting applications. If you prefer to approve one by one, do nothing. Preferences: <a href="${site}/preferences" style="color:#64748B;">${site}/preferences</a></p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0F172A;font-size:14.5px;line-height:1.6;">${en ? bodyEn : bodyIt}</div>`;
  const text = `${greet}\n\n${en ? "Turn on auto-apply" : "Attiva l'auto-apply"}: ${link}`;
  return { subject, html, text };
}
