"use client";

import { useState } from "react";

type Destination = { host: string; slug: string; url: string };

type ResultView = {
  ok?: boolean;
  error?: string | null;
  mode?: string | null;
  status?: string | null;
  submitConfirmation?: string | null;
  receiptId?: string | null;
  applicationId?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function receiptIdFrom(result: Record<string, unknown> | null): string | null {
  const raw = result?.submissionReceiptJson;
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as { receiptId?: unknown; id?: unknown };
    if (typeof parsed.receiptId === "string") return parsed.receiptId;
    if (typeof parsed.id === "string") return parsed.id;
  } catch { /* ignore */ }
  return null;
}

function pickResult(body: unknown): ResultView {
  const root = asRecord(body);
  const result = asRecord(root?.result);
  return {
    ok: typeof root?.ok === "boolean" ? root.ok : undefined,
    error: typeof root?.error === "string" ? root.error : null,
    mode: typeof root?.mode === "string" ? root.mode : null,
    status: typeof result?.status === "string" ? result.status : null,
    submitConfirmation: typeof result?.submitConfirmation === "string" ? result.submitConfirmation : null,
    receiptId: receiptIdFrom(result),
    applicationId: typeof root?.applicationId === "string"
      ? root.applicationId
      : (typeof result?.id === "string" ? result.id : null),
  };
}

export function AtsTestAdminPanel({
  destinations,
  realSubmitEnabled,
}: {
  destinations: Destination[];
  realSubmitEnabled: boolean;
}) {
  const [jobUrl, setJobUrl] = useState(destinations[0]?.url ?? "");
  const [dryLocked, setDryLocked] = useState(false);
  const [realLocked, setRealLocked] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [view, setView] = useState<ResultView | null>(null);

  async function run(realSubmit: boolean) {
    if (realSubmit ? realLocked : dryLocked) return;
    if (realSubmit) setRealLocked(true);
    else setDryLocked(true);
    try {
      const res = await fetch("/api/admin/ats-test-apply", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ realSubmit, jobUrl: jobUrl || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      setHttpStatus(res.status);
      setView(pickResult(body));
    } catch {
      setHttpStatus(null);
      setView({ error: "request_failed" });
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
        <span style={{ color: "var(--fg-subtle)" }}>Allowlisted destination</span>
        {destinations.length > 1 ? (
          <select style={inputStyle} value={jobUrl} onChange={(event) => setJobUrl(event.target.value)}>
            {destinations.map((dest) => (
              <option key={dest.url} value={dest.url}>{dest.url}</option>
            ))}
          </select>
        ) : (
          <input style={inputStyle} value={jobUrl || destinations[0]?.url || "—"} readOnly />
        )}
      </label>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
        <dt style={{ color: "var(--fg-subtle)" }}>ATS_TEST_REAL_SUBMIT</dt>
        <dd style={{ margin: 0 }}>{realSubmitEnabled ? "true" : "unset / false"}</dd>
      </dl>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="adm-btn primary" disabled={dryLocked} onClick={() => void run(false)}>
          Dry run (no submission)
        </button>
        <button type="button" className="adm-btn" disabled={realLocked || !realSubmitEnabled} onClick={() => void run(true)}>
          Real submit (one-time)
        </button>
      </div>
      {view && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
          <dt style={{ color: "var(--fg-subtle)" }}>http</dt>
          <dd style={{ margin: 0 }}>{httpStatus ?? "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>result status</dt>
          <dd style={{ margin: 0 }}>{view.status || view.error || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>submitConfirmation</dt>
          <dd style={{ margin: 0 }}>{view.submitConfirmation || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>receiptId</dt>
          <dd style={{ margin: 0 }}>{view.receiptId || "—"}</dd>
          <dt style={{ color: "var(--fg-subtle)" }}>application id</dt>
          <dd style={{ margin: 0 }}>{view.applicationId || "—"}</dd>
          {view.mode && (
            <>
              <dt style={{ color: "var(--fg-subtle)" }}>mode</dt>
              <dd style={{ margin: 0 }}>{view.mode}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
