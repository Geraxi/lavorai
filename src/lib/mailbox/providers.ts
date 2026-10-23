import { sendersPaused } from "../sender-hold";
/**
 * Client minimi Gmail API e Microsoft Graph per inviare dalla casella
 * dell'utente e rileggere il thread (rimbalzi). `fetch` è iniettabile: i test
 * usano SEMPRE un fetch finto, nessuna rete reale.
 */
import { buildMime, toBase64Url, type OutgoingMail } from "./mime";
import type { ThreadMessage } from "./delivery-state";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type MailboxProvider = "gmail" | "outlook";

export interface SendResult {
  providerMessageId: string;
  providerThreadId: string | null;
  internetMessageId: string | null;
}

/** Errore con classificazione: "rejected" = rifiuto esplicito (nessun invio), "unknown" = esito ambiguo. */
export class ProviderSendError extends Error {
  constructor(public kind: "rejected" | "unknown" | "auth", public status: number | null, message: string) { super(message); }
}

export interface MailboxClient {
  provider: MailboxProvider;
  send(mail: OutgoingMail): Promise<SendResult>;
  /** Messaggi del thread dell'invio. Lancia se non leggibile. */
  readThread(ref: { providerMessageId: string; providerThreadId: string | null; internetMessageId: string | null }): Promise<ThreadMessage[]>;
}

const REJECTED = new Set([400, 403, 404, 413, 422]);
function classify(status: number): ProviderSendError["kind"] {
  if (status === 401) return "auth";
  return REJECTED.has(status) ? "rejected" : "unknown";
}

/**
 * gmail.send (invio) + gmail.readonly (già richiesto dal progetto Google per l'Inbox,
 * copre threads.get format=metadata usato per i rimbalzi). Niente gmail.metadata:
 * non serve accanto a readonly e aggiungerebbe un altro scope restricted da verificare.
 */
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];
export const GRAPH_SCOPES = ["offline_access", "User.Read", "Mail.Send", "Mail.ReadWrite"];

export function gmailClient(accessToken: string, f: Fetch = fetch): MailboxClient {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    provider: "gmail",
    async send(mail) {
      if (sendersPaused()) throw new ProviderSendError("rejected", null, "senders_paused");
      let res: Response;
      try {
        res = await f(`${base}/messages/send`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ raw: toBase64Url(buildMime(mail)) }) });
      } catch (e) {
        throw new ProviderSendError("unknown", null, e instanceof Error ? e.message : "network_error");
      }
      if (!res.ok) throw new ProviderSendError(classify(res.status), res.status, `gmail_send_${res.status}`);
      const body = await res.json().catch(() => null) as { id?: string; threadId?: string } | null;
      if (!body?.id) throw new ProviderSendError("unknown", res.status, "gmail_missing_id");
      return { providerMessageId: body.id, providerThreadId: body.threadId ?? null, internetMessageId: mail.messageId };
    },
    async readThread(ref) {
      if (!ref.providerThreadId) throw new Error("missing_thread_id");
      const url = `${base}/threads/${encodeURIComponent(ref.providerThreadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Content-Type`;
      const res = await f(url, { headers: auth });
      if (!res.ok) throw new Error(`gmail_thread_${res.status}`);
      const body = await res.json() as { messages?: Array<{ id: string; snippet?: string; internalDate?: string; payload?: { mimeType?: string; headers?: { name: string; value: string }[] } }> };
      return (body.messages ?? []).map((m) => {
        const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
        return {
          id: m.id, from: h("from"), subject: h("subject"), snippet: m.snippet,
          date: m.internalDate ? new Date(Number(m.internalDate)) : null,
          contentType: h("content-type") || m.payload?.mimeType, isOurs: m.id === ref.providerMessageId,
        };
      });
    },
  };
}

export function graphClient(accessToken: string, f: Fetch = fetch): MailboxClient {
  const base = "https://graph.microsoft.com/v1.0/me";
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    provider: "outlook",
    async send(mail) {
      if (sendersPaused()) throw new ProviderSendError("rejected", null, "senders_paused");
      // 1) bozza (restituisce id, conversationId, internetMessageId) 2) send.
      // /sendMail risponde 202 senza id: non darebbe evidenza tracciabile.
      let draft: Response;
      try {
        draft = await f(`${base}/messages`, {
          method: "POST", headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: mail.subject,
            body: { contentType: "Text", content: mail.text },
            toRecipients: [{ emailAddress: { address: mail.to } }],
            internetMessageId: mail.messageId,
            attachments: mail.attachments.map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename, contentType: a.contentType, contentBytes: a.content.toString("base64") })),
          }),
        });
      } catch (e) {
        // Una bozza non inviata non raggiunge nessuno: rifiuto sicuro.
        throw new ProviderSendError("rejected", null, e instanceof Error ? e.message : "network_error");
      }
      if (!draft.ok) throw new ProviderSendError(draft.status === 401 ? "auth" : "rejected", draft.status, `graph_draft_${draft.status}`);
      const d = await draft.json() as { id?: string; conversationId?: string; internetMessageId?: string };
      if (!d.id) throw new ProviderSendError("rejected", draft.status, "graph_missing_id");
      if (sendersPaused()) throw new ProviderSendError("rejected", null, "senders_paused");
      let sent: Response;
      try {
        sent = await f(`${base}/messages/${encodeURIComponent(d.id)}/send`, { method: "POST", headers: auth });
      } catch (e) {
        throw new ProviderSendError("unknown", null, e instanceof Error ? e.message : "network_error");
      }
      if (sent.status !== 202 && !sent.ok) throw new ProviderSendError(classify(sent.status), sent.status, `graph_send_${sent.status}`);
      return { providerMessageId: d.id, providerThreadId: d.conversationId ?? null, internetMessageId: d.internetMessageId ?? mail.messageId };
    },
    async readThread(ref) {
      if (!ref.providerThreadId) throw new Error("missing_conversation_id");
      const filter = encodeURIComponent(`conversationId eq '${ref.providerThreadId.replace(/'/g, "''")}'`);
      const res = await f(`${base}/messages?$filter=${filter}&$select=id,from,subject,receivedDateTime,bodyPreview,internetMessageId&$top=50`, { headers: auth });
      if (!res.ok) throw new Error(`graph_thread_${res.status}`);
      const body = await res.json() as { value?: Array<{ id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; internetMessageId?: string; from?: { emailAddress?: { name?: string; address?: string } } }> };
      return (body.value ?? []).map((m) => ({
        id: m.id,
        from: `${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>`,
        subject: m.subject ?? "", snippet: m.bodyPreview,
        date: m.receivedDateTime ? new Date(m.receivedDateTime) : null,
        isOurs: m.internetMessageId === ref.internetMessageId,
      }));
    },
  };
}
