"use client";

import { useState } from "react";

type SanitizedView = {
  accepted?: boolean;
  emailId?: string | null;
  errorName?: string | null;
  statusCode?: number | null;
  message?: string | null;
  attemptId?: string | null;
  evidenceLevel?: string | null;
  error?: string | null;
};

type ReceivingCheckView = {
  ok?: boolean;
  keySlot?: string;
  listStatus?: number | null;
  fetchStatus?: number | null;
  fetchedId?: string | null;
  idMatches?: boolean;
  receivedAt?: string | null;
  hasBody?: boolean;
  errorName?: string | null;
  statusCode?: number | null;
  message?: string | null;
  error?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pickSanitized(body: unknown): SanitizedView {
  const root = asRecord(body);
  const provider = asRecord(root?.provider) ?? asRecord(asRecord(root?.delivery)?.provider);
  const result = asRecord(root?.result);
  const delivery = asRecord(root?.delivery);
  return {
    accepted: typeof provider?.accepted === "boolean" ? provider.accepted : undefined,
    emailId: typeof provider?.emailId === "string"
      ? provider.emailId
      : (typeof delivery?.providerEmailId === "string" ? delivery.providerEmailId : null),
    errorName: typeof provider?.errorName === "string" ? provider.errorName : null,
    statusCode: typeof provider?.statusCode === "number" || provider?.statusCode === null ? provider.statusCode : null,
    message: typeof provider?.message === "string" ? provider.message : null,
    attemptId: typeof result?.attemptId === "string" ? result.attemptId : null,
    evidenceLevel: typeof delivery?.evidenceLevel === "string" ? delivery.evidenceLevel : null,
    error: typeof root?.error === "string" ? root.error : null,
  };
}

export function EmailTestAdminPanel({
  destination,
  defaultRunKey,
}: {
  destination: string;
  defaultRunKey: string;
}) {
  const [runKey, setRunKey] = useState(defaultRunKey);
  const [sendLocked, setSendLocked] = useState(false);
  const [status, setStatus] = useState<SanitizedView | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [receiving, setReceiving] = useState<ReceivingCheckView | null>(null);
  const [receivingHttp, setReceivingHttp] = useState<number | null>(null);

  async function sendOnce() {
    if (sendLocked) return;
    if (!window.confirm(`Send one test email to ${destination} with runKey ${runKey}?`)) return;
    setSendLocked(true);
    try {
      const res = await fetch("/api/admin/email-test-send", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination, runKey }),
      });
      const body = await res.json().catch(() => ({}));
      setHttpStatus(res.status);
      setStatus(pickSanitized(body));
    } catch {
      setHttpStatus(null);
      setStatus({ error: "request_failed" });
    }
  }

  async function checkReceivingKey() {
    try {
      const res = await fetch("/api/admin/resend-receiving-check?requireReceivingKey=1", {
        method: "GET",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      const root = asRecord(body);
      const err = asRecord(root?.error);
      setReceivingHttp(res.status);
      setReceiving({
        ok: typeof root?.ok === "boolean" ? root.ok : undefined,
        keySlot: typeof root?.keySlot === "string" ? root.keySlot : undefined,
        listStatus: typeof root?.listStatus === "number" || root?.listStatus === null ? root.listStatus : null,
        fetchStatus: typeof root?.fetchStatus === "number" || root?.fetchStatus === null ? root.fetchStatus : null,
        fetchedId: typeof root?.fetchedId === "string" ? root.fetchedId : null,
        idMatches: typeof root?.idMatches === "boolean" ? root.idMatches : undefined,
        receivedAt: typeof root?.receivedAt === "string" ? root.receivedAt : null,
        hasBody: typeof root?.hasBody === "boolean" ? root.hasBody : undefined,
        errorName: typeof err?.name === "string" ? err.name : null,
        statusCode: typeof err?.statusCode === "number" || err?.statusCode === null ? err.statusCode : null,
        message: typeof err?.message === "string" ? err.message : null,
        error: typeof root?.error === "string" ? root.error : null,
      });
    } catch {
      setReceivingHttp(null);
      setReceiving({ error: "request_failed" });
    }
  }

  async function checkStatus() {
    const params = new URLSearchParams({ runKey, destination });
    try {
      const res = await fetch(`/api/admin/email-test-send?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      setHttpStatus(res.status);
      setStatus(pickSanitized(body));
    } catch {
      setHttpStatus(null);
      setStatus({ error: "request_failed" });
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--bg-sunken)",
    border: "1px solid var(--border-ds)",
    color: "var(--fg)",
    fontSize: 12.5,
    outline: "none",
  } as const;

  return (
    <div className="adm-card-body" style={{ gap: 12 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        <span style={{ color: "var(--fg-subtle)" }}>Destination</span>
        <input style={inputStyle} value={destination} readOnly />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        <span style={{ color: "var(--fg-subtle)" }}>runKey</span>
        <input
          style={inputStyle}
          value={runKey}
          onChange={(event) => setRunKey(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="adm-btn primary" disabled={sendLocked} onClick={() => void sendOnce()}>
          Send one test email
        </button>
        <button type="button" className="adm-btn" onClick={() => void checkStatus()}>
          Check status
        </button>
        <button type="button" className="adm-btn" onClick={() => void checkReceivingKey()}>
          Check receiving key
        </button>
      </div>
      {receiving && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
          <dt style={{ color: "var(--fg-subtle)" }}>receiving http</dt>
          <dd style={{ margin: 0 }}>{receivingHttp ?? "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>ok</dt>
          <dd style={{ margin: 0 }}>{receiving.ok == null ? "—" : String(receiving.ok)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>keySlot</dt>
          <dd style={{ margin: 0 }}>{receiving.keySlot || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>listStatus</dt>
          <dd style={{ margin: 0 }}>{receiving.listStatus == null ? "—" : String(receiving.listStatus)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>fetchStatus</dt>
          <dd style={{ margin: 0 }}>{receiving.fetchStatus == null ? "—" : String(receiving.fetchStatus)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>fetchedId</dt>
          <dd style={{ margin: 0 }}>{receiving.fetchedId || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>idMatches</dt>
          <dd style={{ margin: 0 }}>{receiving.idMatches == null ? "—" : String(receiving.idMatches)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>receivedAt</dt>
          <dd style={{ margin: 0 }}>{receiving.receivedAt || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>hasBody</dt>
          <dd style={{ margin: 0 }}>{receiving.hasBody == null ? "—" : String(receiving.hasBody)}</dd>
          {receiving.errorName && (
            <>
              <dt style={{ color: "var(--fg-subtle)" }}>errorName</dt>
              <dd style={{ margin: 0 }}>{receiving.errorName}</dd>
            </>
          )}
          {receiving.message && (
            <>
              <dt style={{ color: "var(--fg-subtle)" }}>message</dt>
              <dd style={{ margin: 0 }}>{receiving.message}</dd>
            </>
          )}
          {receiving.error && (
            <>
              <dt style={{ color: "var(--fg-subtle)" }}>error</dt>
              <dd style={{ margin: 0 }}>{receiving.error}</dd>
            </>
          )}
        </dl>
      )}
      {status && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
          <dt style={{ color: "var(--fg-subtle)" }}>http</dt>
          <dd style={{ margin: 0 }}>{httpStatus ?? "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>accepted</dt>
          <dd style={{ margin: 0 }}>{status.accepted == null ? "—" : String(status.accepted)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>emailId</dt>
          <dd style={{ margin: 0 }}>{status.emailId || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>errorName</dt>
          <dd style={{ margin: 0 }}>{status.errorName || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>statusCode</dt>
          <dd style={{ margin: 0 }}>{status.statusCode == null ? "—" : String(status.statusCode)}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>message</dt>
          <dd style={{ margin: 0 }}>{status.message || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>attemptId</dt>
          <dd style={{ margin: 0 }}>{status.attemptId || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>evidenceLevel</dt>
          <dd style={{ margin: 0 }}>{status.evidenceLevel || "—"}</dd>
          {status.error && (
            <>
              <dt style={{ color: "var(--fg-subtle)" }}>error</dt>
              <dd style={{ margin: 0 }}>{status.error}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
