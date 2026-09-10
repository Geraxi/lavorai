import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  applicationIdFromInboundAddress,
  forwardReplyToUser,
} from "@/lib/email";
import { classifyReply, replyKindToUserStatus } from "@/lib/reply-parser";

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
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    // campi custom aggiunti via resend.emails.send tags/headers
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
  };
}

/** Estrae il primo indirizzo da una stringa o array (campo `to` Resend). */
function firstAddress(to: string[] | string | undefined): string | null {
  if (!to) return null;
  if (Array.isArray(to)) return to[0] ?? null;
  return to;
}

/** Rimuove i tag HTML per ricavare testo grezzo se manca text/plain. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_BODY = 8000;

/**
 * Gestisce una risposta inbound del recruiter (Resend Inbound → email.received).
 * Mappa l'email all'application via l'indirizzo reply+<appId>@inbound,
 * la classifica, la salva, aggiorna lo status e la inoltra all'utente.
 */
async function handleInboundReply(dataIn: ResendEvent["data"]): Promise<void> {
  let data = dataIn;
  const toAddr = firstAddress(data.to);
  let appId = applicationIdFromInboundAddress(toAddr);
  let forwardedFrom: string | null = null;
  if (!appId) {
    // Inoltro manuale: l'utente gira a inbox@<dominio> una risposta ricevuta
    // sulla sua email personale (candidature vecchie, o recruiter che scrive
    // all'indirizzo del CV). Riconosciamo l'utente dal mittente e la
    // candidatura dal contenuto (azienda / ruolo / dominio del recruiter).
    const matched = await matchForwardedReply(data);
    if (!matched) {
      console.warn(`[webhook/resend] inbound non mappabile: to=${toAddr ?? "?"} from=${data.from ?? "?"}`);
      return;
    }
    appId = matched.appId;
    forwardedFrom = matched.recruiterFrom;
  }

  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: {
      id: true,
      userStatus: true,
      user: { select: { email: true } },
      job: { select: { title: true, company: true } },
    },
  });
  if (!app) {
    console.warn(`[webhook/resend] inbound reply per app inesistente: ${appId}`);
    return;
  }

  // Il webhook `email.received` di Resend porta solo i metadati (from, to,
  // subject, email_id): il corpo va letto dall'API Receiving.
  if (!data.text && !data.html && data.email_id && process.env.RESEND_API_KEY) {
    try {
      const r = await fetch(`https://api.resend.com/emails/receiving/${data.email_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (r.ok) {
        const full = (await r.json()) as { text?: string; html?: string; subject?: string; from?: string };
        data = { ...data, text: full.text, html: full.html, subject: data.subject ?? full.subject, from: data.from ?? full.from };
      } else {
        console.warn(`[webhook/resend] receiving fetch ${r.status} for ${data.email_id}`);
      }
    } catch (err) {
      console.warn("[webhook/resend] receiving fetch failed", err);
    }
  }

  const from = forwardedFrom ?? data.from ?? "sconosciuto";
  const subject = (data.subject ?? "").replace(/^\s*(fwd?|i|tr|wg)\s*:\s*/i, "") || null;
  const bodyRaw =
    data.text && data.text.trim()
      ? data.text
      : data.html
        ? htmlToText(data.html)
        : "";
  const bodyText = bodyRaw.slice(0, MAX_BODY) || null;

  const { kind, isHuman } = classifyReply({
    fromAddress: from,
    subject,
    bodyText,
  });

  // 1. Salva la risposta (sempre, anche auto/bounce, per trasparenza).
  await prisma.applicationReply.create({
    data: {
      applicationId: app.id,
      fromAddress: from.slice(0, 320),
      subject: subject?.slice(0, 500) ?? null,
      bodyText,
      kind,
      isHuman,
    },
  });

  // 2. Aggiorna l'application SOLO per risposte umane reali. Non sovrascriviamo
  //    uno status più avanzato già impostato a mano (es. "offerta").
  if (isHuman) {
    const nextStatus = replyKindToUserStatus(kind);
    const ADVANCED = ["offerta", "colloquio"];
    const keepExisting =
      app.userStatus && ADVANCED.includes(app.userStatus) && kind === "risposta";

    await prisma.application.update({
      where: { id: app.id },
      data: {
        lastReplyAt: new Date(),
        lastReplyKind: kind,
        replyCount: { increment: 1 },
        ...(nextStatus && !keepExisting ? { userStatus: nextStatus } : {}),
      },
    });
  } else if (kind === "ricevuta") {
    // Conferma di ricezione: prova di consegna. Conta come risposta,
    // segna "vista" se non c'è già uno stato, non sovrascrive nulla.
    await prisma.application.update({
      where: { id: app.id },
      data: {
        lastReplyAt: new Date(),
        lastReplyKind: kind,
        replyCount: { increment: 1 },
        viewedAt: new Date(),
        ...(app.userStatus ? {} : { userStatus: "vista" }),
      },
    });
  } else {
    // auto/bounce: traccia il conteggio ma non tocca lo status.
    await prisma.application.update({
      where: { id: app.id },
      data: { replyCount: { increment: 1 } },
    });
  }

  // 3. Inoltra all'utente (anche auto/bounce: vuole comunque vederle).
  if (app.user?.email) {
    await forwardReplyToUser({
      userEmail: app.user.email,
      recruiterFrom: from,
      jobTitle: app.job.title,
      company: app.job.company,
      subject,
      bodyText,
      kind,
    }).catch((err) =>
      console.error("[webhook/resend] forward reply failed", err),
    );
  }
}

/**
 * Verifica firma Resend. Resend usa il formato Svix: header `svix-id`,
 * `svix-timestamp`, `svix-signature` ("v1,<base64>"), HMAC-SHA256 con la
 * chiave base64 dopo il prefisso "whsec_" su "<id>.<timestamp>.<body>".
 * Manteniamo anche il vecchio formato hex sul solo body per compatibilità.
 */
/**
 * Mappa una email inoltrata dall'utente a una sua candidatura.
 * 1. utente = mittente (deve essere registrato)
 * 2. recruiter = prima riga "From:/Da:" nel corpo inoltrato (se presente)
 * 3. candidatura = quella (inviata) la cui azienda compare in subject/body
 *    o il cui dominio del job coincide col dominio del recruiter; a parità
 *    la più recente.
 */
async function matchForwardedReply(
  data: ResendEvent["data"],
): Promise<{ appId: string; recruiterFrom: string | null } | null> {
  const senderEmail = (data.from ?? "").match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase();
  if (!senderEmail) return null;
  const user = await prisma.user.findFirst({ where: { email: { equals: senderEmail, mode: "insensitive" } }, select: { id: true } });
  if (!user) return null;

  const raw = data.text && data.text.trim() ? data.text : data.html ? htmlToText(data.html) : "";
  const text = `${data.subject ?? ""}\n${raw}`.toLowerCase();
  const fromLine = raw.match(/^\s*(?:from|da|de|von)\s*:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const recruiterFrom = fromLine && /@/.test(fromLine) ? fromLine.slice(0, 320) : null;
  const recruiterDomain = recruiterFrom?.match(/@([\w.-]+)/)?.[1]?.toLowerCase().replace(/^(mail|email|jobs|careers|hr|recruiting)\./, "") ?? null;

  const apps = await prisma.application.findMany({
    where: { userId: user.id, status: { in: ["success", "ready_to_apply", "needs_answers", "applying"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, job: { select: { company: true, title: true, url: true } } },
  });
  let best: { id: string; score: number } | null = null;
  for (const a of apps) {
    let score = 0;
    const company = (a.job.company ?? "").toLowerCase().trim();
    if (company.length >= 3 && text.includes(company)) score += 3;
    const title = (a.job.title ?? "").toLowerCase().trim();
    if (title.length >= 6 && text.includes(title)) score += 2;
    if (recruiterDomain) {
      try {
        const host = new URL(a.job.url).hostname.toLowerCase();
        const root = recruiterDomain.split(".").slice(-2).join(".");
        if (host.endsWith(root)) score += 2;
        const brand = root.split(".")[0];
        if (brand.length >= 4 && company.includes(brand)) score += 2;
      } catch { /* url non valida */ }
    }
    if (score > 0 && (!best || score > best.score)) best = { id: a.id, score };
  }
  if (!best) return null;
  console.log(`[webhook/resend] inoltro mappato → app ${best.id} (score ${best.score}) da ${senderEmail}`);
  return { appId: best.id, recruiterFrom };
}

function verify(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // in dev se non settato, accetta
  const svixId = req.headers.get("svix-id");
  const svixTs = req.headers.get("svix-timestamp");
  const svixSig = req.headers.get("svix-signature");
  if (svixId && svixTs && svixSig) {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${svixId}.${svixTs}.${rawBody}`).digest("base64");
    const ok = svixSig.split(/\s+/).some((part) => {
      const [, sig] = part.split(",");
      if (!sig || sig.length !== expected.length) return false;
      try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
    });
    if (ok) {
      // anti-replay: 5 minuti
      const age = Math.abs(Date.now() / 1000 - Number(svixTs));
      return Number.isFinite(age) && age < 300;
    }
    return false;
  }
  const signature = req.headers.get("resend-signature") ?? req.headers.get("x-resend-signature");
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
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
  if (!verify(request, raw)) {
    console.warn("[webhook/resend] bad signature");
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

  // Risposta inbound del recruiter (Resend Inbound). I nomi degli eventi
  // inbound sono cambiati nel tempo: gestiamo le varianti note.
  if (
    event.type === "email.received" ||
    event.type === "inbound.email" ||
    event.type === "email.inbound"
  ) {
    try {
      await handleInboundReply(event.data);
    } catch (err) {
      console.error("[webhook/resend] inbound handling failed", err);
    }
  }

  // Accetta tutto, anche eventi non gestiti — 200 per evitare retry Resend
  return NextResponse.json({ ok: true });
}
