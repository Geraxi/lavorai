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
async function handleInboundReply(data: ResendEvent["data"]): Promise<void> {
  const toAddr = firstAddress(data.to);
  const appId = applicationIdFromInboundAddress(toAddr);
  if (!appId) return; // non è una reply mappabile — ignora

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

  const from = data.from ?? "sconosciuto";
  const subject = data.subject ?? null;
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

function verify(signature: string | null, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // in dev se non settato, accetta
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // signature format "sha256=<hex>" o diretto — gestiamo entrambi
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
  const signature =
    request.headers.get("resend-signature") ??
    request.headers.get("x-resend-signature") ??
    request.headers.get("svix-signature");

  if (!verify(signature, raw)) {
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
