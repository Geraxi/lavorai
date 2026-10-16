import type { InboxMessage } from "./inbox-message";
export interface AttentionItem { id: string; href: string; title: string; detail: string; date: string | null; kind: "application" | "message" | "draft"; unread?: boolean | null }
export type AttentionReply = { applicationId: string; parentReplyId: string; status: string; acceptedAt: Date | null; createdAt: Date };
/** Read does not mean answered. An ambiguous/failed send never clears attention. */
export function messageNeedsAttention(message: InboxMessage, replies: AttentionReply[], now = new Date()) {
  if (message.isHuman !== true || !message.jobRelated || !["risposta", "colloquio"].includes(message.kind) || message.handledAt) return false;
  if (message.remindAt && new Date(message.remindAt) > now) return false;
  return message.source !== "application_reply" || !replies.some(reply => reply.applicationId === message.applicationId
    && ["accepted", "delivered", "delayed"].includes(reply.status) && reply.acceptedAt && reply.acceptedAt >= new Date(message.date));
}
export const attentionStatuses = ["needs_answers", "needs_session", "awaiting_consent", "ready_to_apply", "failed"];
export function blockedAction(status: string, en: boolean) {
  return ({ needs_answers: ["Completa le risposte richieste", "Complete required answers"], needs_session: ["Verifica il collegamento al portale", "Check the portal connection"], awaiting_consent: ["Rivedi il consenso richiesto", "Review requested consent"], ready_to_apply: ["Rivedi la candidatura preparata", "Review the prepared application"], failed: ["Controlla il problema di invio", "Review the submission problem"] }[status]?.[en ? 1 : 0]) ?? (en ? "Verify the outcome before retrying" : "Verifica l'esito prima di riprovare");
}
