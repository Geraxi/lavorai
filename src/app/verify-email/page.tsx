"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/design/icon";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "ok" | "fail">("pending");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("fail");
      setErr("Link non valido.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus("ok");
        } else {
          setStatus("fail");
          setErr(body?.message ?? "Link non valido.");
        }
      } catch {
        setStatus("fail");
        setErr("Errore di rete.");
      }
    })();
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        {status === "pending" && (
          <>
            <div style={iconBox}>
              <Icon name="refresh" size={22} />
            </div>
            <h1 style={title}>Verifica in corso...</h1>
            <p style={lead}>Un momento.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <div
              style={{
                ...iconBox,
                background: "var(--primary-weak)",
                color: "var(--primary-ds)",
              }}
            >
              <Icon name="check" size={22} />
            </div>
            <h1 style={title}>Email verificata ✓</h1>
            <p style={lead}>Ora puoi accedere al tuo account.</p>
            <Link
              href="/login"
              className="ds-btn ds-btn-primary"
              style={{ marginTop: 20 }}
            >
              Vai al login <Icon name="arrow-right" size={13} />
            </Link>
          </>
        )}
        {status === "fail" && (
          <>
            <div
              style={{
                ...iconBox,
                background: "var(--red-weak)",
                color: "var(--red-ds)",
              }}
            >
              <Icon name="x" size={22} />
            </div>
            <h1 style={title}>Verifica fallita</h1>
            <p style={lead}>{err}</p>
            <Link
              href="/login"
              className="ds-btn"
              style={{ marginTop: 20 }}
            >
              ← Torna al login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

const iconBox: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  background: "var(--bg-sunken)",
  color: "var(--fg-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 20,
};

const title: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  margin: "0 0 10px",
};

const lead: React.CSSProperties = {
  fontSize: 14.5,
  color: "var(--fg-muted)",
  lineHeight: 1.5,
  margin: 0,
};
