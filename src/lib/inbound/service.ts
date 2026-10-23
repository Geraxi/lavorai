/** UserInbox lifecycle + inbound processing (DB). Never sends or forwards mail. */
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { newSlug, userInboxDomain, inboxRecipients } from "./address";
import { classifyInbound, type AiClassifier } from "./classify";
import { extractCodes, extractLinks } from "./extract";
import { bestApplicationMatch } from "./match";
import type { NormalizedInbound } from "./providers";

type Db = Pick<PrismaClient, "user" | "userInbox" | "inboundEmail" | "application" | "$executeRaw">;
const MAX_BODY = 20_000;

export async function getUserInboxAddress(db: Pick<PrismaClient, "userInbox">, userId: string): Promise<string | null> {
  const row = await db.userInbox.findUnique({ where: { userId }, select: { address: true, disabledAt: true } });
  return row && !row.disabledAt ? row.address : null;
}

/** Idempotent: returns the existing address or creates one (retries slug collisions). */
export async function ensureUserInbox(db: Pick<PrismaClient, "user" | "userInbox">, userId: string, env: Record<string, string | undefined> = process.env) {
  const existing = await db.userInbox.findUnique({ where: { userId } });
  if (existing) return existing;
  const domain = userInboxDomain(env);
  if (!domain) throw new Error("inbound_domain_invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user) throw new Error("user_not_found");
  for (let i = 0; i < 5; i++) {
    const slug = newSlug(user.name, user.email);
    try {
      return await db.userInbox.create({ data: { userId, slug, domain, address: `${slug}@${domain}` } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const mine = await db.userInbox.findUnique({ where: { userId } });
        if (mine) return mine; // concurrent creation for the same user
        continue; // slug collision → new random suffix
      }
      throw e;
    }
  }
  throw new Error("inbox_slug_exhausted");
}

export function htmlToText(html: string): string {
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export type InboundResult = { stored: number; duplicates: number; unknownRecipient: boolean; confirmed: string[] };

export async function processUserInboundEmail(mail: NormalizedInbound, deps: { db: Db; env: Record<string, string | undefined>; ai?: AiClassifier | null; now?: () => Date }): Promise<InboundResult> {
  const domain = userInboxDomain(deps.env);
  const result: InboundResult = { stored: 0, duplicates: 0, unknownRecipient: false, confirmed: [] };
  const recipients = domain ? inboxRecipients(mail.to, domain) : [];
  const inboxes = recipients.length ? await deps.db.userInbox.findMany({ where: { address: { in: recipients }, disabledAt: null } }) : [];
  if (!inboxes.length) { result.unknownRecipient = true; return result; }
  const body = (mail.text?.trim() || (mail.html ? htmlToText(mail.html) : "")).slice(0, MAX_BODY);
  const codes = extractCodes(`${mail.subject}\n${body}`);
  const links = extractLinks(body, mail.html);
  const { category, by } = await classifyInbound(mail.subject, body, deps.ai);
  const now = deps.now?.() ?? new Date();

  for (const inbox of inboxes) {
    // Dedupe key per inbox so one mail to two users is stored for each.
    const providerMessageId = inboxes.length > 1 ? `${mail.providerMessageId}:${inbox.id}` : mail.providerMessageId;
    const dup = await deps.db.inboundEmail.findUnique({ where: { provider_providerMessageId: { provider: mail.provider, providerMessageId } }, select: { id: true } });
    if (dup) { result.duplicates++; continue; }
    const since = new Date(now.getTime() - 90 * 86_400_000);
    const apps = await deps.db.application.findMany({
      where: { userId: inbox.userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 300,
      select: { id: true, submittedAt: true, createdAt: true, job: { select: { company: true, title: true, url: true } } },
    });
    const applicationId = bestApplicationMatch(apps.map((a) => ({ id: a.id, company: a.job.company, title: a.job.title, url: a.job.url, at: a.submittedAt ?? a.createdAt })), { from: mail.from, subject: mail.subject, body });
    let row;
    try {
      row = await deps.db.inboundEmail.create({ data: {
        inboxId: inbox.id, userId: inbox.userId, provider: mail.provider, providerMessageId, rfcMessageId: mail.rfcMessageId?.slice(0, 500) ?? null,
        fromAddress: mail.from.slice(0, 500), toAddress: inbox.address, subject: mail.subject.slice(0, 1000) || null, bodyText: body || null,
        receivedAt: mail.receivedAt, category, classifiedBy: by, codesJson: JSON.stringify(codes), linksJson: JSON.stringify(links),
        applicationId, matchedAt: applicationId ? now : null,
      } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") { result.duplicates++; continue; }
      throw e;
    }
    result.stored++;
    if (category === "confirmation" && applicationId && await recordAtsConfirmation(deps.db, { applicationId, userId: inbox.userId, inboundEmailId: row.id, at: mail.receivedAt })) {
      result.confirmed.push(applicationId);
    }
  }
  return result;
}

/**
 * Proof-of-send: an ATS confirmation email proves the application arrived.
 * Writes Application.confirmedAt + sentProofType=ats_confirmation_email (columns
 * from the proof_of_send migration) via SQL so this module also compiles without
 * them; if the columns are absent it logs and skips. Never overwrites an
 * earlier confirmation; keeps an existing stronger proof (e.g. gmail id).
 */
export async function recordAtsConfirmation(db: Pick<PrismaClient, "$executeRaw">, input: { applicationId: string; userId: string; inboundEmailId: string; at: Date }): Promise<boolean> {
  try {
    const n = await db.$executeRaw`
      UPDATE "Application" SET
        "confirmedAt" = ${input.at},
        "sentProofType" = COALESCE("sentProofType", 'ats_confirmation_email'::"SentProofType"),
        "sentProofRef" = COALESCE("sentProofRef", ${`inbound:${input.inboundEmailId}`}),
        "sentAt" = COALESCE("sentAt", ${input.at}),
        "sendStatus" = 'submitted'::"SendStatus",
        "sendFailureReason" = NULL
      WHERE "id" = ${input.applicationId} AND "userId" = ${input.userId} AND "confirmedAt" IS NULL`;
    return n === 1;
  } catch (e) {
    const code = (e as { code?: string; meta?: { code?: string } })?.meta?.code ?? (e as { code?: string })?.code;
    console.error(`[inbound] confirmation not recorded for ${input.applicationId} (${code ?? "error"}): apply the proof_of_send migration`);
    return false;
  }
}
