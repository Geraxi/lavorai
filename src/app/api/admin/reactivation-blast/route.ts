import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { sendWithinQuota } from "@/lib/email-quota";
import { renderBrandEmail } from "@/lib/email-brand";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/reactivation-blast
 * Sends 3 segmented reactivation emails to free, non-suspended users.
 * 
 * Auth: Authorization: Bearer <REACTIVATION_BLAST_SECRET> (or CRON_SECRET fallback)
 * Body: { dryRun?: boolean } — if true, returns counts + samples without sending
 * 
 * Segments:
 *   A) No CV → "Manca un solo passo per far partire LavorAI"
 *   B) Has CV but 0 successful apps → "Abbiamo sistemato l'invio reale delle candidature"
 *   C) Has ≥1 successful app → "Un favore (e 1 mese Pro se porti un amico)"
 */
export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get("authorization");
  const blastSecret = process.env.REACTIVATION_BLAST_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  
  const authorized =
    (blastSecret && auth === `Bearer ${blastSecret}`) ||
    (!blastSecret && cronSecret && auth === `Bearer ${cronSecret}`);

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  const from = process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";

  // Fetch all eligible users (free, not suspended, email verified)
  const users = await prisma.user.findMany({
    where: {
      tier: "free",
      suspendedAt: null,
      emailVerified: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      cvDocuments: { select: { id: true }, take: 1 },
      applications: {
        where: { status: "success" },
        select: { id: true },
        take: 1,
      },
      _count: {
        select: {
          applications: {
            where: { status: "success" },
          },
        },
      },
    },
  });

  // Filter out test accounts
  const eligible = users.filter((u) => !isTestAccount(u.email));

  // Segment users
  const segmentA = eligible.filter((u) => u.cvDocuments.length === 0);
  const segmentB = eligible.filter(
    (u) => u.cvDocuments.length > 0 && u._count.applications === 0
  );
  const segmentC = eligible.filter(
    (u) => u.cvDocuments.length > 0 && u._count.applications > 0
  );

  const results = {
    A: { count: segmentA.length, sent: 0, failed: 0, errors: [] as string[] },
    B: { count: segmentB.length, sent: 0, failed: 0, errors: [] as string[] },
    C: { count: segmentC.length, sent: 0, failed: 0, errors: [] as string[] },
  };

  if (dryRun) {
    // Return sample emails for each segment
    const samples = {
      A: segmentA.length > 0 ? renderSegmentA(segmentA[0], site) : null,
      B: segmentB.length > 0 ? renderSegmentB(segmentB[0], site) : null,
      C: segmentC.length > 0 ? renderSegmentC(segmentC[0], site) : null,
    };

    return NextResponse.json({
      ok: true,
      dryRun: true,
      sent: results,
      samples: {
        A: samples.A ? { to: segmentA[0].email, subject: samples.A.subject, preview: samples.A.text.slice(0, 200) } : null,
        B: samples.B ? { to: segmentB[0].email, subject: samples.B.subject, preview: samples.B.text.slice(0, 200) } : null,
        C: samples.C ? { to: segmentC[0].email, subject: samples.C.subject, preview: samples.C.text.slice(0, 200) } : null,
      },
    });
  }

  if (!resend) {
    return NextResponse.json(
      { error: "missing_resend_key", message: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Send segment A
  for (const user of segmentA) {
    await sendSegment("A", user, () => renderSegmentA(user, site), resend, from, results.A);
    // Small delay to avoid rate limits
    await delay(100);
  }

  // Send segment B
  for (const user of segmentB) {
    await sendSegment("B", user, () => renderSegmentB(user, site), resend, from, results.B);
    await delay(100);
  }

  // Send segment C
  for (const user of segmentC) {
    await sendSegment("C", user, () => renderSegmentC(user, site), resend, from, results.C);
    await delay(100);
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    sent: results,
  });
}

async function sendSegment(
  segment: string,
  user: { email: string },
  renderFn: () => { subject: string; html: string; text: string },
  resend: InstanceType<typeof Resend>,
  from: string,
  stats: { sent: number; failed: number; errors: string[] }
) {
  try {
    const { subject, html, text } = renderFn();
    
    const result = await sendWithinQuota("reactivation_blast", user.email, async () => {
      const { error } = await resend.emails.send({
        from,
        to: user.email,
        subject,
        html,
        text,
      });
      if (error) throw new Error(JSON.stringify(error));
    });

    if (result.sent) {
      stats.sent++;
    } else {
      stats.failed++;
      stats.errors.push(`${user.email}: ${result.reason}`);
    }
  } catch (err) {
    stats.failed++;
    const msg = err instanceof Error ? err.message : "unknown error";
    stats.errors.push(`${user.email}: ${msg.slice(0, 100)}`);
  }
}

function renderSegmentA(
  user: { name: string | null; locale: string | null },
  site: string
): { subject: string; html: string; text: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0];
  
  const subject = "Manca un solo passo per far partire LavorAI";
  const { html, text } = renderBrandEmail({
    locale: user.locale,
    eyebrow: "Attiva il tuo account",
    preheader: "Il tuo account è pronto, manca solo il CV per iniziare.",
    title: "Manca un solo passo per far partire LavorAI",
    greeting: first ? `Ciao ${first},` : undefined,
    paragraphs: [
      "Hai creato il tuo account LavorAI ma non hai ancora caricato il CV. Serve solo quello per far partire le candidature automatiche.",
      "Una volta caricato, LavorAI inizierà a cercare le offerte compatibili con il tuo profilo e a candidarti ogni giorno con CV e lettera su misura.",
    ],
    cta: {
      label: "Carica il CV",
      url: `${site}/onboarding`,
    },
    footnote: "Hai bisogno di aiuto? Rispondi a questa email.",
  });

  return { subject, html, text };
}

function renderSegmentB(
  user: { name: string | null; locale: string | null },
  site: string
): { subject: string; html: string; text: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0];
  
  const subject = "Abbiamo sistemato l'invio reale delle candidature";
  const { html, text } = renderBrandEmail({
    locale: user.locale,
    eyebrow: "Aggiornamento piattaforma",
    preheader: "L'infrastruttura di invio è stata corretta. Controlla le tue Preferenze.",
    title: "Abbiamo sistemato l'invio reale delle candidature",
    greeting: first ? `Ciao ${first},` : undefined,
    paragraphs: [
      "Abbiamo risolto alcuni problemi tecnici che impedivano l'invio effettivo delle candidature. Ora tutto funziona come previsto.",
      "Ti consigliamo di controllare le tue <strong>Preferenze</strong> e verificare che la modalità sia impostata su <strong>Hybrid</strong> o <strong>Auto</strong> per ricominciare a inviare candidature.",
    ],
    cta: {
      label: "Vai alle Preferenze",
      url: `${site}/preferences`,
    },
    secondary: {
      label: "Vedi la dashboard",
      url: `${site}/dashboard`,
    },
    footnote: "Se hai domande o dubbi, rispondi a questa email.",
  });

  return { subject, html, text };
}

function renderSegmentC(
  user: { name: string | null; locale: string | null },
  site: string
): { subject: string; html: string; text: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0];
  
  const subject = "Un favore (e 1 mese Pro se porti un amico)";
  const { html, text } = renderBrandEmail({
    locale: user.locale,
    eyebrow: "Programma referral",
    preheader: "Invita un amico e ricevi 1 mese di LavorAI Pro gratis.",
    title: "Un favore (e 1 mese Pro se porti un amico)",
    greeting: first ? `Ciao ${first},` : undefined,
    paragraphs: [
      "Stai usando LavorAI e hai già ricevuto candidature inviate con successo. Se conosci qualcuno che cerca lavoro e potrebbe beneficiare della piattaforma, ti chiediamo di condividere LavorAI con loro.",
      "Quando un amico si iscrive tramite il tuo link e inizia a usare la piattaforma, riceverai <strong>1 mese di piano Pro gratuito</strong> come ringraziamento.",
    ],
    cta: {
      label: "Chiedi il tuo link referral",
      url: `mailto:${from.match(/<(.+)>/)?.[1] ?? "noreply@lavorai.it"}?subject=Link referral`,
    },
    secondary: {
      label: "Scopri il piano Pro",
      url: `${site}/pricing`,
    },
    footnote: "Rispondi a questa email per ricevere il tuo link personalizzato.",
  });

  return { subject, html, text };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
