import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { isTestAccount } from "@/lib/admin";
import { esc, renderBrandEmail } from "@/lib/email-brand";

/**
 * Digest settimanale "le offerte che ti stai perdendo" per gli utenti Free.
 *
 * Ogni lunedì: per ogni utente Free con ruoli nelle preferenze, cerca le
 * offerte entrate nel pool negli ultimi 7 giorni che matchano i ruoli e
 * manda le prime 5 con CTA alla prova Pro di 7 giorni. Chi non ha ruoli
 * riceve un nudge a completare le preferenze. Max 1 email ogni 6 giorni
 * (guard su EmailLog kind="weekly_digest").
 */

const KIND = "weekly_digest" as const;
const DEFAULT_CAP = 150;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface WeeklyDigestResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: { email: string; matches: number; status: string }[];
}

interface DigestJob { id: string; title: string; company: string | null; location: string | null; url: string; remote: boolean }

function parseRoles(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export async function runWeeklyDigest(opts?: {
  dryRun?: boolean;
  onlyEmail?: string;
  force?: boolean; // ignora il check "solo lunedì"
  cap?: number;
}): Promise<WeeklyDigestResult> {
  const details: WeeklyDigestResult["details"] = [];
  const rome = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  if (!opts?.force && !opts?.onlyEmail && rome.getDay() !== 1) {
    return { sent: 0, skipped: 0, candidates: 0, details: [{ email: "-", matches: 0, status: "not_monday" }] };
  }

  const users = await prisma.user.findMany({
    where: {
      tier: "free",
      suspendedAt: null,
      emailVerified: { not: null },
      ...(opts?.onlyEmail ? { email: opts.onlyEmail } : {}),
    },
    select: { id: true, email: true, name: true, locale: true, preferences: { select: { rolesJson: true, locationsJson: true } } },
    take: 2000,
  });

  const recentLogs = await prisma.emailLog.findMany({
    where: { kind: KIND, createdAt: { gte: new Date(Date.now() - 6 * 24 * 3600 * 1000) } },
    select: { to: true },
  });
  const alreadySent = new Set(recentLogs.map((l) => l.to.toLowerCase()));

  const pool = await prisma.job.findMany({
    where: { cachedAt: { gte: new Date(Date.now() - WEEK_MS) } },
    orderBy: { cachedAt: "desc" },
    select: { id: true, title: true, company: true, location: true, url: true, remote: true },
    take: 4000,
  });

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  const cap = opts?.cap ?? DEFAULT_CAP;
  let sent = 0;
  let skipped = 0;
  let candidates = 0;

  for (const u of users) {
    if (isTestAccount(u.email)) continue;
    if (!opts?.force && alreadySent.has(u.email.toLowerCase())) continue;
    const roles = parseRoles(u.preferences?.rolesJson);
    const matches = roles.length ? pickMatches(pool, roles, parseRoles(u.preferences?.locationsJson)) : [];
    // Senza ruoli e senza match non c'è niente di utile da dire: skip.
    if (roles.length && matches.length === 0) continue;
    candidates++;
    if (sent >= cap) { skipped++; details.push({ email: u.email, matches: matches.length, status: "cap" }); continue; }
    if (opts?.dryRun) { details.push({ email: u.email, matches: matches.length, status: "dry_run" }); continue; }
    if (!resend) { skipped++; details.push({ email: u.email, matches: matches.length, status: "no_resend_key" }); continue; }
    try {
      const r = await sendWithinQuota(KIND, u.email, async () => {
        const { subject, html, text } = renderDigest(u, roles, matches);
        const { error } = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
          to: u.email,
          subject,
          html,
          text,
        });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (r.sent) { sent++; details.push({ email: u.email, matches: matches.length, status: "sent" }); }
      else { skipped++; details.push({ email: u.email, matches: matches.length, status: r.reason ?? "skipped" }); }
    } catch (err) {
      skipped++;
      details.push({ email: u.email, matches: matches.length, status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?") });
    }
  }
  return { sent, skipped, candidates, details };
}

/** Top 5 match: titolo compatibile con i ruoli, preferenza a città/remote. */
export function pickMatches(pool: DigestJob[], roles: string[], locations: string[]): DigestJob[] {
  const locs = locations.map((l) => l.toLowerCase());
  const seen = new Set<string>();
  const scored: { j: DigestJob; s: number }[] = [];
  for (const j of pool) {
    if (!titleMatchesAnyRole(j.title, roles)) continue;
    const key = `${(j.company ?? "").toLowerCase()}|${j.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const loc = (j.location ?? "").toLowerCase();
    let s = 1;
    if (j.remote) s += 1;
    if (locs.length && locs.some((l) => loc.includes(l))) s += 2;
    scored.push({ j, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.j);
}

function renderDigest(
  u: { name: string | null; locale: string | null },
  roles: string[],
  jobs: DigestJob[],
): { subject: string; html: string; text: string } {
  const en = u.locale === "en";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const first = u.name?.trim().split(/\s+/)[0];
  const greeting = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : undefined;
  const noRoles = roles.length === 0;
  const subject = noRoles
    ? en ? "Tell us what you're looking for and LavorAI applies for you" : "Dicci cosa cerchi e LavorAI si candida per te"
    : en
      ? `${jobs.length} new ${roles[0]} openings this week you haven't applied to`
      : `${jobs.length} nuove offerte "${roles[0]}" questa settimana a cui non ti sei candidato`;
  const rows = jobs
    .map(
      (j) => `<tr><td style="padding:11px 0;border-top:1px solid #EEECE6;">
  <a href="${esc(j.url)}" style="color:#0F1012;text-decoration:none;font-weight:600;font-size:14.5px;">${esc(j.title)}</a>
  <div style="color:#8A8C90;font-size:12.5px;margin-top:2px;">${esc(j.company ?? "")}${j.location ? ` · ${esc(j.location)}` : ""}${j.remote ? (en ? " · Remote" : " · Remoto") : ""}</div>
</td></tr>`,
    )
    .join("");
  const { html, text } = renderBrandEmail({
    locale: u.locale,
    eyebrow: en ? "Weekly matches" : "Offerte della settimana",
    preheader: noRoles ? undefined : en ? `${jobs.length} matches for ${roles[0]} entered the pool this week.` : `${jobs.length} offerte per ${roles[0]} entrate nel pool questa settimana.`,
    title: noRoles
      ? en ? "Tell us what you're looking for" : "Dicci cosa stai cercando"
      : en ? `${jobs.length} openings match your profile this week` : `${jobs.length} offerte compatibili con il tuo profilo questa settimana`,
    greeting,
    paragraphs: noRoles
      ? en
        ? ["You signed up to LavorAI but haven't told us which roles you want. Add 1 to 3 roles and a city: from then on we find matching openings every day and prepare the application for you."]
        : ["Ti sei iscritto a LavorAI ma non ci hai ancora detto quali ruoli cerchi. Aggiungi 1-3 ruoli e una città: da lì in poi troviamo ogni giorno le offerte compatibili e prepariamo la candidatura al posto tuo."]
      : en
        ? [`These entered the pool this week for <strong>${esc(roles.slice(0, 3).join(", "))}</strong>. In view-only mode they sit here; with Pro, LavorAI applies to them for you, CV and cover letter included.`]
        : [`Sono entrate nel pool questa settimana per <strong>${esc(roles.slice(0, 3).join(", "))}</strong>. In sola visualizzazione restano qui; con Pro, LavorAI si candida per te, CV e lettera inclusi.`],
    rawBlock: noRoles ? undefined : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;border-bottom:1px solid #EEECE6;">${rows}</table>`,
    cta: noRoles
      ? { label: en ? "Set my preferences" : "Imposta le preferenze", url: `${site}/preferences` }
      : { label: en ? "Try Pro free for 7 days" : "Prova Pro gratis per 7 giorni", url: `${site}/settings#billing` },
    secondary: noRoles ? undefined : { label: en ? "Or apply one by one from Jobs" : "Oppure candidati una per una da Offerte", url: `${site}/jobs` },
    footnote: en ? "You receive this weekly digest because you have a view-only account. Manage it from Preferences." : "Ricevi questo riepilogo settimanale perché hai un account in sola visualizzazione. Gestiscilo dalle Preferenze.",
  });
  return { subject, html, text };
}
