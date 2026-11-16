/**
 * Pure planner for re-running the current reply classifier over stored
 * ApplicationReply rows. Used only by the opt-in script
 * scripts/reclassify-replies.ts (dry-run by default). Never sends anything.
 */
import { classifyReply, type ReplyKind } from "@/lib/reply-parser";

export type StoredReply = {
  id: string; applicationId: string; fromAddress: string; subject: string | null; bodyText: string | null;
  kind: string; isHuman: boolean; isSecurityCode: boolean; receivedAt: Date;
};
export type StoredApplication = { id: string; userStatus: string | null; replyCount: number; lastReplyKind: string | null };
export type ReplyChange = { id: string; applicationId: string; from: { kind: string; isHuman: boolean; isSecurityCode: boolean }; to: { kind: ReplyKind; isHuman: boolean; isSecurityCode: boolean } };
export type ApplicationChange = { id: string; data: { replyCount?: number; userStatus?: null; lastReplyKind?: string | null } };

const HUMAN_KINDS = new Set(["risposta", "colloquio", "rifiutata"]);

export function planReplyReclassification(replies: StoredReply[], applications: StoredApplication[]): { replies: ReplyChange[]; applications: ApplicationChange[] } {
  const changes: ReplyChange[] = [];
  const next = new Map<string, StoredReply>();
  for (const reply of replies) {
    const verdict = classifyReply({ fromAddress: reply.fromAddress, subject: reply.subject, bodyText: reply.bodyText });
    const to = { kind: verdict.kind, isHuman: verdict.isHuman, isSecurityCode: verdict.isSecurityCode === true || reply.isSecurityCode };
    // Only ever demote: a stored non-human row is never promoted to human here.
    if (!reply.isHuman && to.isHuman) { next.set(reply.id, reply); continue; }
    if (to.kind !== reply.kind || to.isHuman !== reply.isHuman || to.isSecurityCode !== reply.isSecurityCode) {
      changes.push({ id: reply.id, applicationId: reply.applicationId, from: { kind: reply.kind, isHuman: reply.isHuman, isSecurityCode: reply.isSecurityCode }, to });
      next.set(reply.id, { ...reply, ...to });
    } else next.set(reply.id, reply);
  }
  const touched = new Set(changes.map((change) => change.applicationId));
  const appChanges: ApplicationChange[] = [];
  for (const app of applications) {
    if (!touched.has(app.id)) continue;
    const own = [...next.values()].filter((reply) => reply.applicationId === app.id && !reply.isSecurityCode)
      .sort((a, b) => +a.receivedAt - +b.receivedAt);
    const human = own.filter((reply) => reply.isHuman && HUMAN_KINDS.has(reply.kind));
    const data: ApplicationChange["data"] = {};
    if (human.length < app.replyCount) data.replyCount = human.length;
    // Only the generic "risposta" status is withdrawn, and only when no human
    // reply remains. colloquio/rifiutata/offerta (possibly set by the user) stay.
    if (app.userStatus === "risposta" && human.length === 0) data.userStatus = null;
    const lastKind = own.at(-1)?.kind ?? null;
    if (HUMAN_KINDS.has(app.lastReplyKind ?? "") && human.length === 0 && lastKind !== app.lastReplyKind) data.lastReplyKind = lastKind;
    if (Object.keys(data).length) appChanges.push({ id: app.id, data });
  }
  return { replies: changes, applications: appChanges };
}
