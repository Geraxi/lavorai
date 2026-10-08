"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Banner mostrato agli utenti password non ancora verificati.
 * Possono completare l'onboarding, ma le candidature restano bloccate
 * finché non cliccano il link di verifica.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("auth");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setSending(true);
    try {
      await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        padding: "10px 16px",
        background: "var(--amber-weak)",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      <span>
        {t("verifyBannerText")} <strong>{email}</strong>.{" "}
      </span>
      {sent ? (
        <span>{t("verifyEmailSent")}</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={sending}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--fg)",
            textDecoration: "underline",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {sending ? t("verifyResending") : t("verifyResend")}
        </button>
      )}
    </div>
  );
}
