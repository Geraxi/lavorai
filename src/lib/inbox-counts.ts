/**
 * Pure inbox counters shared by the Inbox page, the attention queue and
 * dashboard-metrics-shared, so "non letti" means the same thing everywhere:
 * a job-related message (LavorAI reply or Gmail mail matched to job search)
 * whose read state is known and is unread. Unknown historical read state is
 * NOT counted as unread.
 */
export interface CountableMessage {
  jobRelated?: boolean;
  read: boolean | null;
}

export function isUnreadJobMessage(message: CountableMessage): boolean {
  return !!message.jobRelated && message.read === false;
}

export function countUnreadJobMessages(messages: CountableMessage[]): number {
  return messages.reduce((sum, message) => sum + (isUnreadJobMessage(message) ? 1 : 0), 0);
}
