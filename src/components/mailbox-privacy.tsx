"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MailboxNotifyMode } from "@/lib/application-mailbox";

export function MailboxPrivacyCard({
  locale,
  mailboxNotifyMode,
}: {
  locale: string;
  mailboxNotifyMode: MailboxNotifyMode;
}) {
  const en = locale === "en";
  const router = useRouter();
  const [mode, setMode] = useState<MailboxNotifyMode>(mailboxNotifyMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: MailboxNotifyMode) {
    setMode(next);
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      const response = await fetch("/api/settings/mailbox-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxNotifyMode: next }),
      });
      if (!response.ok) throw new Error();
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: 0, lineHeight: 1.55 }}>
        {en
          ? "Applications use a LavorAI address (reply+id@inbound.lavorai.it). Incoming mail is processed only to match it to your applications, classify it, and show it in Posta candidature. Messages are kept for 180 days, then deleted. We never reply to the employer for you."
          : "Le candidature usano un indirizzo LavorAI (reply+id@inbound.lavorai.it). Le email in arrivo sono elaborate solo per collegarle alle tue candidature, classificarle e mostrarle in Posta candidature. I messaggi restano 180 giorni, poi vengono cancellati. Non rispondiamo noi al recruiter."}
      </p>
      <label className="ds-label" htmlFor="mailbox-notify-mode">
        {en ? "Mailbox notifications" : "Notifiche posta candidature"}
      </label>
      <select
        id="mailbox-notify-mode"
        className="ds-input"
        value={mode}
        disabled={busy}
        onChange={(event) => save(event.target.value as MailboxNotifyMode)}
      >
        <option value="priority">
          {en ? "Immediate for interviews and recruiter questions; daily digest for the rest" : "Immediate per colloqui e domande; digest quotidiano per il resto"}
        </option>
        <option value="digest">{en ? "Daily digest only" : "Solo digest quotidiano"}</option>
        <option value="off">{en ? "No mailbox emails" : "Nessuna email di posta"}</option>
      </select>
      {saved && <p role="status" style={{ fontSize: 12, color: "var(--fg-muted)", margin: 0 }}>{en ? "Preference saved." : "Preferenza salvata."}</p>}
      {error && <p role="alert" style={{ fontSize: 12, margin: 0 }}>{en ? "Preference was not saved. Try again." : "Preferenza non salvata. Riprova."}</p>}
    </div>
  );
}
