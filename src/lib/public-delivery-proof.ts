import { prisma } from "@/lib/db";
import { applicationEvidenceDate, deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";

const REPLY_KINDS = ["risposta", "colloquio", "rifiutata"];
/** Aggregate-only public output. No recipient, candidate, body or receipt payload leaves this helper. */
export async function getPublicDeliveryProof(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const totals = { confirmed: 0, confirmedMonth: 0, portalConfirmed: 0, emailDelivered: 0, providerAccepted: 0, legacyUnverified: 0, deliveryProblems: 0, pending: 0, replies: 0 };
  const portals = new Map<string, number>();
  let recent: { date: Date; source: string; label: string }[] = [];
  let cursor: string | undefined;
  // Validate structured receipts in bounded batches; a legacy marker must never
  // enter the public total merely because it starts with DETECTED.
  for (;;) {
    const rows = await prisma.application.findMany({
      where: { OR: [{ submittedVia: { not: null } }, { emailAttempts: { some: {} } }] },
      orderBy: { id: "asc" }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, userId: true, status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
        createdAt: true, completedAt: true, submittedAt: true,
        emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true, createdAt: true } },
        replies: { where: { isHuman: true, isSecurityCode: false, kind: { in: REPLY_KINDS } }, select: { receivedAt: true } },
        gmailMessages: { where: { isHuman: true, kind: { in: REPLY_KINDS } }, select: { date: true, userId: true } },
      },
    });
    for (const row of rows) {
      const evidence = deliveryEvidence(row);
      const date = applicationEvidenceDate(row);
      if (+date > +now) continue;
      if (evidence === "provider_accepted") totals.providerAccepted++;
      if (evidence === "legacy_unverified") totals.legacyUnverified++;
      if (evidence === "delivery_problem") totals.deliveryProblems++;
      if (evidence === "pending") totals.pending++;
      if (!isConfirmedDelivery(evidence)) continue;
      totals.confirmed++;
      if (+date >= +monthStart) totals.confirmedMonth++;
      if (evidence === "confirmed_portal") totals.portalConfirmed++;
      if (evidence === "confirmed_email") totals.emailDelivered++;
      const responseDates = [...row.replies.map(reply => reply.receivedAt), ...row.gmailMessages.filter(message => message.userId === row.userId).map(message => message.date)];
      if (responseDates.some(responseDate => +responseDate >= +date && +responseDate <= +now)) totals.replies++;
      const source = evidence === "confirmed_email" ? "Email" : (row.submittedVia ?? "ATS").replace("portal_", "");
      portals.set(source, (portals.get(source) ?? 0) + 1);
      recent.push({ date, source, label: evidence === "confirmed_email" ? "Consegna al server destinatario" : "Ricevuta di candidatura ATS" });
    }
    recent = recent.sort((a, b) => +b.date - +a.date).slice(0, 20);
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  return { ...totals, recent, portals: [...portals].map(([source, count]) => ({ source, count })) };
}
