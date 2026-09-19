"use client";

import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/design/company-logo";
import { Icon } from "@/components/design/icon";
import { toast } from "sonner";

export interface DrawerApp {
  id: string;
  company: string;
  color: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  applied: string;
  match: number;
  source: string;
  stage: number;
  status: "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
  jobUrl?: string;
  coverLetterText?: string | null;
  hasCvDocx?: boolean;
  hasCoverLetterDocx?: boolean;
  hasCvPdf?: boolean;
  cvLanguage?: string | null;
  ghostingDays?: number;
  lastReplyAt?: string | null;
}

const PIPELINE = ["Applicata", "Vista", "Screening", "Colloquio", "Offerta"];

export function DetailDrawer({
  app,
  onClose,
}: {
  app: DrawerApp | null;
  onClose: () => void;
}) {
  const open = !!app;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`ds-drawer-backdrop${open ? " open" : ""}`}
        onClick={onClose}
      />
      <aside className={`ds-drawer${open ? " open" : ""}`}>
        {app && (
          <>
            <div
              className="flex items-center justify-between border-b"
              style={{
                padding: "14px 20px",
                borderColor: "var(--border-ds)",
              }}
            >
              <div className="flex items-center gap-3">
                <CompanyLogo company={app.company} color={app.color} size={36} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{app.role}</div>
                  <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                    {app.company} · {app.location} · {app.mode}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {app.jobUrl && (
                  <a
                    className="ds-btn ds-btn-sm ds-btn-ghost"
                    href={app.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Apri annuncio"
                  >
                    <Icon name="external" size={13} />
                  </a>
                )}
                <button
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  type="button"
                  onClick={onClose}
                  aria-label="Chiudi"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <div
              className="ds-scroll"
              style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}
            >
              {/* Mini stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                  marginBottom: 22,
                }}
              >
                <MiniStat label="Match" value={`${app.match}%`} accent={app.match >= 85} />
                <MiniStat label="RAL" value={app.salary} mono />
                <MiniStat label="Inviata" value={app.applied} />
              </div>

              {/* Pipeline */}
              <div className="mb-6">
                <div className="ds-label mb-2">Pipeline</div>
                <div className="ds-pipeline">
                  {PIPELINE.map((p, i) => (
                    <div
                      key={p}
                      className={`ds-pipeline-step${
                        i <= app.stage ? " done" : ""
                      }${i === app.stage ? " current" : ""}`}
                    >
                      <div className="ds-pipeline-step-label">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="ds-pipeline-step-value">{p}</div>
                    </div>
                  ))}
                </div>
              </div>


              {/* Documents */}
              <div className="ds-section-card mb-6">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="file" size={13} />
                    Materiali inviati
                  </div>
                </div>
                <div className="ds-section-body flush">
                  <DocRow
                    title={`CV PDF tailored${app.cvLanguage ? ` (${app.cvLanguage.toUpperCase()})` : ""}`}
                    sub="ATS-friendly · riordinato per questo annuncio"
                    available={Boolean(app.hasCvPdf)}
                    downloadHref={
                      app.hasCvPdf
                        ? `/api/applications/${app.id}/document?kind=pdf`
                        : undefined
                    }
                  />
                  <DocRow
                    title="CV DOCX (classico)"
                    sub="Versione DOCX ottimizzata"
                    available={Boolean(app.hasCvDocx)}
                    downloadHref={
                      app.hasCvDocx
                        ? `/api/applications/${app.id}/document?kind=cv`
                        : undefined
                    }
                  />
                  <DocRow
                    title="Lettera motivazionale"
                    sub="Scritta su misura per questa candidatura"
                    available={Boolean(app.hasCoverLetterDocx)}
                    downloadHref={
                      app.hasCoverLetterDocx
                        ? `/api/applications/${app.id}/document?kind=cover`
                        : undefined
                    }
                    last
                  />
                </div>
              </div>

              {/* Cover letter anteprima */}
              {app.coverLetterText && (
                <div className="ds-section-card mb-6">
                  <div className="ds-section-head">
                    <div className="ds-section-head-title">
                      <Icon name="sparkles" size={13} />
                      Lettera di motivazione
                    </div>
                    {app.hasCoverLetterDocx && (
                      <a
                        className="ds-btn ds-btn-sm ds-btn-ghost"
                        href={`/api/applications/${app.id}/document?kind=cover`}
                        download
                      >
                        <Icon name="download" size={12} /> DOCX
                      </a>
                    )}
                  </div>
                  <div className="ds-section-body">
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.65,
                        color: "var(--fg)",
                        fontFamily:
                          '"Charter", "Georgia", "Times New Roman", serif',
                        maxHeight: 420,
                        overflow: "auto",
                        padding: "4px 2px",
                      }}
                    >
                      {app.coverLetterText}
                    </div>
                  </div>
                </div>
              )}


              {/* User status + Follow-up actions */}
              {app.ghostingDays !== undefined && app.ghostingDays >= 7 && !app.lastReplyAt && (
                <div
                  className="ds-section-card mb-6"
                  style={{
                    padding: "14px 16px",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border-ds)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 10 }}>
                    Nessuna risposta dopo {app.ghostingDays} giorni — normale per molti ATS
                  </div>
                  <FollowUpButton appId={app.id} />
                </div>
              )}

              <div className="ds-section-card mb-6">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="check" size={13} />
                    Aggiorna stato
                  </div>
                </div>
                <div className="ds-section-body flush">
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", padding: "0 0 10px 0" }}>
                    Hai ricevuto risposte via email o LinkedIn? Aggiorna lo stato manualmente:
                  </div>
                  <UserStatusButtons appId={app.id} currentStatus={app.status} />
                </div>
              </div>

              <div className="flex gap-2" style={{ marginTop: 22 }}>
                {app.jobUrl ? (
                  <a
                    className="ds-btn"
                    style={{ flex: 1 }}
                    href={app.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="external" size={13} /> Vedi annuncio
                  </a>
                ) : (
                  <button
                    className="ds-btn"
                    style={{ flex: 1 }}
                    type="button"
                    disabled
                    title="Link annuncio non disponibile"
                  >
                    <Icon name="external" size={13} /> Vedi annuncio
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function MiniStat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid var(--border-ds)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-elev)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</div>
      <div
        className={mono ? "mono" : undefined}
        style={{
          marginTop: 6,
          fontSize: 15,
          fontWeight: 600,
          color: accent ? "var(--primary-ds)" : "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DocRow({
  title,
  sub,
  available,
  downloadHref,
  last,
}: {
  title: string;
  sub: string;
  available: boolean;
  downloadHref?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--border-ds)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 40,
          border: "1px solid var(--border-strong)",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-sunken)",
          flexShrink: 0,
        }}
      >
        <Icon name="file" size={14} style={{ color: "var(--fg-muted)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 1 }}>
          {available ? sub : "In generazione…"}
        </div>
      </div>
      {available && downloadHref ? (
        <a
          className="ds-btn ds-btn-sm ds-btn-ghost"
          href={downloadHref}
          download
        >
          <Icon name="download" size={12} />
        </a>
      ) : (
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--fg-subtle)" }}
        >
          pending
        </span>
      )}
    </div>
  );
}

function UserStatusButtons({ appId, currentStatus }: { appId: string; currentStatus: string }) {
  const [updating, setUpdating] = useState(false);

  async function setStatus(status: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/applications/${appId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Errore aggiornamento stato");
        return;
      }
      toast.success("Stato aggiornato");
      // Refresh the page to show updated status
      window.location.reload();
    } catch {
      toast.error("Errore di rete");
    } finally {
      setUpdating(false);
    }
  }

  const statuses = [
    { key: "vista", label: "Risposta ricevuta", icon: "inbox" as const },
    { key: "colloquio", label: "Colloquio", icon: "calendar" as const },
    { key: "rifiutata", label: "Rifiutata", icon: "x" as const },
    { key: "offerta", label: "Offerta", icon: "check" as const },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {statuses.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className="ds-btn ds-btn-sm"
          style={{
            justifyContent: "flex-start",
            opacity: currentStatus === key ? 0.5 : 1,
            cursor: currentStatus === key ? "not-allowed" : "pointer",
          }}
          disabled={updating || currentStatus === key}
          onClick={() => setStatus(key)}
        >
          <Icon name={icon} size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

function FollowUpButton({ appId }: { appId: string }) {
  const [loading, setLoading] = useState(false);

  async function openFollowUp() {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${appId}/followup`);
      if (!res.ok) {
        toast.error("Errore generazione follow-up");
        return;
      }
      const { mailto, hasRecruiterEmail } = await res.json();
      if (!hasRecruiterEmail) {
        toast.error("Email recruiter non disponibile per questo annuncio");
        return;
      }
      window.location.href = mailto;
    } catch {
      toast.error("Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="ds-btn ds-btn-sm ds-btn-primary"
      onClick={openFollowUp}
      disabled={loading}
      style={{ width: "100%" }}
    >
      <Icon name="send" size={13} /> Invia follow-up
    </button>
  );
}
