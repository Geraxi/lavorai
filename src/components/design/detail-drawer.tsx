"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyLogo } from "@/components/design/company-logo";
import { Icon } from "@/components/design/icon";
import { toast } from "sonner";
import { applicationLabel } from "@/lib/application-presentation";
import type { DeliveryView } from "@/lib/application-delivery-view";

export interface DrawerApp {
  id: string;
  company: string;
  color: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  applied: string;
  match: number | null;
  source: string;
  stage: number;
  userStatus?: string | null;
  status: "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
  jobUrl?: string;
  coverLetterText?: string | null;
  hasCvDocx?: boolean;
  hasCoverLetterDocx?: boolean;
  hasCvPdf?: boolean;
  cvLanguage?: string | null;
  ghostingDays?: number;
  lastReplyAt?: string | null;
  delivery?: DeliveryView;
  deliveryRecipient?: string | null;
}

export function DetailDrawer({
  app,
  onClose,
  locale = "it",
}: {
  locale?: string;
  app: DrawerApp | null;
  onClose: () => void;
}) {
  const open = !!app;
  const drawerRef = useRef<HTMLElement>(null);
  const tr = (it: string, en: string) => locale === "en" ? en : it;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLButtonElement>("button[data-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const items = [...(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])].filter(el => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`ds-drawer-backdrop${open ? " open" : ""}`}
        onClick={onClose}
      />
      <aside ref={drawerRef} role="dialog" aria-modal={open || undefined} aria-hidden={!open} inert={!open} aria-label={tr("Dettaglio candidatura", "Application details")} className={`ds-drawer${open ? " open" : ""}`}>
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
                    aria-label={tr("Apri annuncio", "Open listing")}
                  >
                    <Icon name="external" size={13} />
                  </a>
                )}
                <button
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  type="button"
                  onClick={onClose}
                  aria-label={tr("Chiudi", "Close")} data-close
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <div
              className="ds-scroll"
              style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}
            >
              {app.delivery && <section style={{ padding: 14, border: "1px solid var(--border-ds)", borderRadius: 8, marginBottom: 18 }}>
                <strong>{app.delivery.label}</strong>
                <p style={{ fontSize: 13, marginTop: 6 }}>{app.delivery.detail}</p>
                {app.deliveryRecipient && <p style={{ fontSize: 12, marginTop: 6 }}>{tr("Destinatario", "Recipient")}: {app.deliveryRecipient}</p>}
              </section>}
              {/* Mini stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  marginBottom: 22,
                }}
              >
                <MiniStat label="Match" value={app.match == null ? "—" : `${app.match}%`} accent={app.match != null && app.match >= 85} />
                <MiniStat label={tr("RAL", "Salary")} value={app.salary} mono />
                <MiniStat label={tr("Registrata", "Recorded")} value={app.applied} />
              </div>

              <section className="workspace-panel mb-6">
                <h2>{tr("Stato dichiarato da te", "Status reported by you")}</h2>
                <p>{app.userStatus ? applicationLabel(app.userStatus, locale) : tr("Nessuno stato dichiarato.", "No status reported.")}</p>
                <p className="workspace-muted">{tr("Le fasi precedenti non sono dedotte da questo stato. Le prove di invio sono indicate separatamente.", "This status does not verify earlier stages. Submission evidence is shown separately.")}</p>
              </section>

              {/* Documents */}
              <div className="ds-section-card mb-6">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="file" size={13} />
                    {tr("Materiali della candidatura", "Application documents")}
                  </div>
                </div>
                <div className="ds-section-body flush">
                  <DocRow locale={locale}
                    title={`CV PDF tailored${app.cvLanguage ? ` (${app.cvLanguage.toUpperCase()})` : ""}`}
                    sub={tr("ATS-friendly · riordinato per questo annuncio", "ATS-friendly · tailored for this role")}
                    available={Boolean(app.hasCvPdf)}
                    downloadHref={
                      app.hasCvPdf
                        ? `/api/applications/${app.id}/document?kind=pdf`
                        : undefined
                    }
                  />
                  <DocRow locale={locale}
                    title={tr("CV DOCX (classico)", "DOCX CV")}
                    sub={tr("Versione DOCX ottimizzata", "Tailored DOCX version")}
                    available={Boolean(app.hasCvDocx)}
                    downloadHref={
                      app.hasCvDocx
                        ? `/api/applications/${app.id}/document?kind=cv`
                        : undefined
                    }
                  />
                  <DocRow locale={locale}
                    title={tr("Lettera motivazionale", "Cover letter")}
                    sub={tr("Scritta su misura per questa candidatura", "Tailored for this application")}
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
                      {tr("Lettera di motivazione", "Cover letter")}
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
                    {app.ghostingDays} {tr("giorni senza risposta registrata", "days without a recorded reply")}
                  </div>
                  <FollowUpButton appId={app.id} locale={locale} />
                </div>
              )}

              <div className="ds-section-card mb-6">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="check" size={13} />
                    {tr("Aggiorna stato", "Update status")}
                  </div>
                </div>
                <div className="ds-section-body flush">
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", padding: "0 0 10px 0" }}>
                    {tr("Hai ricevuto risposte via email o LinkedIn? Aggiorna lo stato manualmente:", "Received a reply by email or LinkedIn? Update your status manually:")}
                  </div>
                  <UserStatusButtons appId={app.id} currentStatus={app.userStatus ?? ""} locale={locale} />
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
                    <Icon name="external" size={13} /> {tr("Vedi annuncio", "View listing")}
                  </a>
                ) : (
                  <button
                    className="ds-btn"
                    style={{ flex: 1 }}
                    type="button"
                    disabled
                    title={tr("Link annuncio non disponibile", "Listing link unavailable")}
                  >
                    <Icon name="external" size={13} /> {tr("Vedi annuncio", "View listing")}
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
  locale,
  title,
  sub,
  available,
  downloadHref,
  last,
}: {
  locale: string;
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
          {available ? sub : locale === "en" ? "Not available" : "Non disponibile"}
        </div>
      </div>
      {available && downloadHref ? (
        <a
          className="ds-btn ds-btn-sm ds-btn-ghost"
          href={downloadHref}
          download
          aria-label={`${locale === "en" ? "Download" : "Scarica"} ${title}`}
        >
          <Icon name="download" size={12} />
        </a>
      ) : (
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--fg-subtle)" }}
        >
          —
        </span>
      )}
    </div>
  );
}

function UserStatusButtons({ appId, currentStatus, locale }: { appId: string; currentStatus: string; locale: string }) {
  const tr = (it: string, en: string) => locale === "en" ? en : it;
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
        toast.error(body.error ?? tr("Errore aggiornamento stato", "Unable to update status"));
        return;
      }
      toast.success(tr("Stato aggiornato", "Status updated"));
      // Refresh the page to show updated status
      window.location.reload();
    } catch {
      toast.error(tr("Errore di rete", "Network error"));
    } finally {
      setUpdating(false);
    }
  }

  const statuses = [
    { key: "vista", label: tr("Risposta ricevuta", "Reply received"), icon: "inbox" as const },
    { key: "colloquio", label: tr("Colloquio", "Interview"), icon: "calendar" as const },
    { key: "rifiutata", label: tr("Rifiutata", "Rejected"), icon: "x" as const },
    { key: "offerta", label: tr("Offerta", "Offer"), icon: "check" as const },
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

function FollowUpButton({ appId, locale }: { appId: string; locale: string }) {
  const tr = (it: string, en: string) => locale === "en" ? en : it;
  const [loading, setLoading] = useState(false);

  async function openFollowUp() {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${appId}/followup`);
      if (!res.ok) {
        toast.error(tr("Errore generazione follow-up", "Unable to prepare follow-up"));
        return;
      }
      const { mailto, hasRecruiterEmail } = await res.json();
      if (!hasRecruiterEmail) {
        toast.error(tr("Email recruiter non disponibile per questo annuncio", "Recruiter email unavailable for this job"));
        return;
      }
      window.location.href = mailto;
    } catch {
      toast.error(tr("Errore di rete", "Network error"));
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
      <Icon name="send" size={13} /> {tr("Prepara follow-up", "Prepare follow-up")}
    </button>
  );
}
