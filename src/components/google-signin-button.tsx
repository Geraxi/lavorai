"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Bottone "Continua con Google". Renderizzato SOLO se
 * NEXT_PUBLIC_GOOGLE_ENABLED === "true" (l'env viene embedded a
 * build-time — se manca il flag il componente non renderizza nulla,
 * evitando bottoni che darebbero 500).
 *
 * position:
 *   - "above" (default): divider "oppure" DOPO il bottone (bottone in
 *     alto, form sotto).
 *   - "below": divider "oppure" PRIMA del bottone (form sopra, Google
 *     come alternativa in fondo).
 */
export function GoogleButton({
  mode,
  position = "above",
}: {
  mode: "signup" | "login";
  position?: "above" | "below";
}) {
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth");
  const enabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";
  if (!enabled) return null;

  const label = mode === "signup" ? t("googleSignup") : t("googleLogin");

  const divider = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "8px 0 16px",
        color: "var(--fg-subtle)",
        fontSize: 11.5,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border-ds)" }} />
      {t("orDivider")}
      <div style={{ flex: 1, height: 1, background: "var(--border-ds)" }} />
    </div>
  );

  const button = (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        signIn("google", { callbackUrl: "/dashboard" });
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 10,
        border: "1px solid var(--border-ds)",
        background: "#fff",
        color: "#1f2937",
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? "wait" : "pointer",
      }}
    >
      <GoogleIcon />
      {loading ? "…" : label}
    </button>
  );

  return position === "below" ? (
    <>
      {divider}
      {button}
    </>
  ) : (
    <>
      {button}
      {divider}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
