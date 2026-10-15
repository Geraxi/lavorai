/** Shared, serializable inbox presentation. Email content is always plain text. */
export interface InboxMessage {
  /** Source-qualified ID: Gmail and application replies can share a database ID. */
  id: string;
  source: "gmail" | "application_reply";
  from: string;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  date: string;
  kind: string;
  label: string;
  /** Inbound replies do not have persisted read state. null must not mean unread. */
  read: boolean | null;
  applicationId: string | null;
  applicationStatus: string | null;
  company: string | null;
  jobTitle: string | null;
  jobRelated: boolean;
  location?: string | null;
  remote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  threadId?: string | null;
  gmailMessageId?: string;
}

export type InboxFilter = "all" | "colloquio" | "risposta" | "rifiutata" | "ricevuta" | "bounce" | "auto";

export function inboxKindLabel(kind: string): string {
  return ({
    colloquio: "Possible interview",
    risposta: "Possible recruiter reply",
    rifiutata: "Possible rejection",
    ricevuta: "Application receipt",
    auto: "Automated message",
    bounce: "Delivery failure",
  } as Record<string, string>)[kind] ?? "Unclassified message";
}

export function inboxSourceLabel(source: InboxMessage["source"]): string {
  return source === "application_reply" ? "LavorAI inbound" : "Gmail";
}

export function filterInboxMessages(
  messages: InboxMessage[],
  options: { kind: InboxFilter; search: string; jobOnly: boolean; oldestFirst: boolean },
): InboxMessage[] {
  const needle = options.search.trim().toLowerCase();
  return messages.filter((message) => {
    if (options.jobOnly && !message.jobRelated) return false;
    if (options.kind !== "all" && message.kind !== options.kind) return false;
    return !needle || [message.from, message.subject, message.snippet, message.company, message.jobTitle]
      .some((value) => value?.toLowerCase().includes(needle));
  }).sort((a, b) => {
    const difference = new Date(b.date).getTime() - new Date(a.date).getTime();
    return (options.oldestFirst ? -difference : difference) || a.id.localeCompare(b.id);
  });
}

export interface InboxOutgoing {
  id: string; parentReplyId: string; applicationId: string; bodyText: string;
  recipient: string; subject: string; status: string; failureCode: string | null; date: string; updatedAt?: string;
}
export function inboxThreadKey(message: InboxMessage): string {
  return message.source === "application_reply" ? `application:${message.applicationId}` : `gmail:${message.threadId ?? message.id}`;
}
