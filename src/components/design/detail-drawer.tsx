"use client";

import { useEffect } from "react";
import { CompanyLogo } from "@/components/design/company-logo";
import { Icon } from "@/components/design/icon";

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
  jobUrl?: string;
  coverLetterText?: string | null;
  hasCvDocx?: boolean;
  hasCoverLetterDocx?: boolean;
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
                <button className="ds-btn ds-btn-sm ds-btn-ghost" type="button">
                  <Icon name="external" size={13} />
                </button>
                <button
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  type="button"
                  onClick={onClose}
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
                <MiniStat label="Fonte" value={app.source} />
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

              {/* Match breakdown */}
              <div className="ds-section-card mb-6">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="sparkles" size={13} />
                    Perché è un match {app.match}%
                  </div>
                </div>
                <div className="ds-section-body">
                  <div style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
                    <MatchRow label="Competenze allineate" value="18 / 22" good />
                    <MatchRow label="Esperienza richiesta (5+ anni)" value="7 anni" good />
                    <MatchRow label="Settore" value="Fintech · match perfetto" good />
                    <MatchRow label="Sede" value={`${app.location} — ${app.mode.toLowerCase()}`} good />
                    <MatchRow label="Inglese" value="C1 richiesto · C1" good />
                    <MatchRow label="Certificazione AWS" value="Non presente" warn />
                  </div>
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
                    title="CV adattato al ruolo"
                    sub="Ottimizzato per questo annuncio specifico"
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

              {/* Timeline */}
              <div className="ds-section-card">
                <div className="ds-section-head">
                  <div className="ds-section-head-title">
                    <Icon name="clock" size={13} />
                    Timeline
                  </div>
                </div>
                <div className="ds-section-body flush">
                  <TimelineItem
                    time="oggi · 09:32"
                    title={`${app.company} ha aperto la tua candidatura`}
                    icon="eye"
                    accent
                  />
                  <TimelineItem
                    time="oggi · 09:14"
                    title="Candidatura inviata"
                    sub="via LinkedIn Easy Apply"
                    icon="send"
                  />
                  <TimelineItem
                    time="oggi · 09:13"
                    title="Lettera motivazionale generata"
                    sub="384 parole · tono professionale"
                    icon="sparkles"
                  />
                  <TimelineItem
                    time="oggi · 09:13"
                    title="CV adattato al JD"
                    sub="+12% match dopo l'adattamento"
                    icon="file"
                  />
                  <TimelineItem
                    time="oggi · 09:12"
                    title="Annuncio rilevato"
                    sub="pubblicato 2 ore fa · LinkedIn"
                    icon="zap"
                    last
                  />
                </div>
              </div>

              <div className="flex gap-2" style={{ marginTop: 22 }}>
                <button className="ds-btn" style={{ flex: 1 }} type="button">
                  <Icon name="external" size={13} /> Vedi annuncio
                </button>
                <button className="ds-btn" style={{ flex: 1 }} type="button">
                  <Icon name="pause-circle" size={13} /> Ritira
                </button>
                <button
                  className="ds-btn ds-btn-primary"
                  style={{ flex: 1 }}
                  type="button"
                >
                  <Icon name="send" size={13} /> Contatta recruiter
                </button>
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

function MatchRow({
  label,
  value,
  good,
  warn,
}: {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        name={good ? "check" : "x"}
        size={13}
        style={{
          color: good
            ? "var(--primary-ds)"
            : warn
              ? "var(--amber)"
              : "var(--red-ds)",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{value}</span>
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

function TimelineItem({
  time,
  title,
  sub,
  icon,
  accent,
  last,
}: {
  time: string;
  title: string;
  sub?: string;
  icon: Parameters<typeof Icon>[0]["name"];
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--border-ds)",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: accent ? "var(--primary-weak)" : "var(--bg-sunken)",
          color: accent ? "var(--primary-ds)" : "var(--fg-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={13} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--fg-muted)",
              marginTop: 1,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div
        className="mono"
        style={{ fontSize: 11, color: "var(--fg-subtle)" }}
      >
        {time}
      </div>
    </div>
  );
}
