"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { StatusChip } from "@/components/design/status-chip";
import { DetailDrawer } from "@/components/design/detail-drawer";

interface ApiApplication {
  id: string;
  status: string;
  portal: string;
  atsScore: number | null;
  suggestions: string[];
  createdAt: string;
  errorMessage: string | null;
  coverLetterText: string | null;
  hasCvDocx: boolean;
  hasCoverLetterDocx: boolean;
  hasCvPdf: boolean;
  cvLanguage: string | null;
  userStatus: string | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    url: string;
    source: string;
  };
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Fallback mock per UI demo quando non ci sono candidature reali
const MOCK: Array<{
  id: string;
  company: string;
  color: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  applied: string;
  status: "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
  match: number;
  source: string;
  stage: number;
}> = [
  { id: "m1", company: "Satispay", color: "#EF3E42", role: "Product Designer", location: "Milano", mode: "Ibrido", salary: "€45k–55k", applied: "2 ore fa", status: "inviata", match: 94, source: "LinkedIn", stage: 1 },
  { id: "m2", company: "Scalapay", color: "#FE5FA3", role: "Senior UX Designer", location: "Milano", mode: "Remoto", salary: "€55k–68k", applied: "4 ore fa", status: "vista", match: 91, source: "Indeed", stage: 2 },
  { id: "m3", company: "Nexi", color: "#1B3C89", role: "Product Designer — Pagamenti", location: "Roma", mode: "Ibrido", salary: "€48k–60k", applied: "5 ore fa", status: "colloquio", match: 88, source: "LinkedIn", stage: 3 },
  { id: "m4", company: "Bending Spoons", color: "#0A0A0A", role: "Senior Product Designer", location: "Milano", mode: "In sede", salary: "€70k–90k", applied: "Ieri", status: "inviata", match: 86, source: "Sito azienda", stage: 1 },
  { id: "m5", company: "Docebo", color: "#7E3FF2", role: "UX Designer", location: "Biassono", mode: "Ibrido", salary: "€42k–52k", applied: "Ieri", status: "rifiutata", match: 78, source: "LinkedIn", stage: 0 },
  { id: "m6", company: "Casavo", color: "#1F6BFF", role: "Product Designer II", location: "Milano", mode: "Remoto", salary: "€50k–62k", applied: "Ieri", status: "vista", match: 89, source: "Welcome to the Jungle", stage: 2 },
  { id: "m7", company: "Lastminute", color: "#F7235C", role: "Senior UI/UX Designer", location: "Chiasso/Milano", mode: "Ibrido", salary: "€48k–58k", applied: "2 giorni fa", status: "colloquio", match: 82, source: "LinkedIn", stage: 3 },
  { id: "m8", company: "Everli", color: "#FF2954", role: "Lead Product Designer", location: "Milano", mode: "Remoto", salary: "€75k–95k", applied: "2 giorni fa", status: "offerta", match: 96, source: "Referral", stage: 4 },
  { id: "m9", company: "Subito", color: "#DD0000", role: "Senior UX Designer", location: "Milano", mode: "Ibrido", salary: "€52k–65k", applied: "3 giorni fa", status: "vista", match: 87, source: "Welcome to the Jungle", stage: 2 },
  { id: "m10", company: "Treatwell", color: "#FF3A9E", role: "Product Designer", location: "Milano", mode: "Remoto", salary: "€46k–58k", applied: "3 giorni fa", status: "rifiutata", match: 74, source: "LinkedIn", stage: 0 },
  { id: "m11", company: "MoneyFarm", color: "#0E4C92", role: "Senior Product Designer", location: "Milano/Londra", mode: "Ibrido", salary: "€60k–75k", applied: "4 giorni fa", status: "colloquio", match: 90, source: "Referral", stage: 3 },
  { id: "m12", company: "Young Platform", color: "#00D084", role: "Product Designer", location: "Torino", mode: "Ibrido", salary: "€45k–55k", applied: "5 giorni fa", status: "vista", match: 85, source: "AngelList", stage: 2 },
];

type Row = (typeof MOCK)[number] & {
  jobUrl?: string;
  coverLetterText?: string | null;
  hasCvDocx?: boolean;
  hasCoverLetterDocx?: boolean;
  hasCvPdf?: boolean;
  cvLanguage?: string | null;
  backendStatus?: string; // raw status from API ("awaiting_consent" etc.)
};

export default function ApplicationsPage() {
  const { data } = useSWR<{ applications: ApiApplication[] }>(
    "/api/applications",
    fetcher,
    { refreshInterval: 5000 },
  );
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Row | null>(null);

  const realRows: Row[] =
    data?.applications.map((a) => ({
      id: a.id,
      company: a.job.company ?? "—",
      color: companyColor(a.job.company ?? a.job.title),
      role: a.job.title,
      location: a.job.location ?? "—",
      mode: "Ibrido",
      salary: "—",
      applied: relativeTime(new Date(a.createdAt)),
      status: (a.userStatus as Row["status"]) ?? backendToStatus(a.status),
      match: a.atsScore ?? 80,
      source: a.job.source === "mock" ? "Demo" : cap(a.job.source),
      stage: 1,
      jobUrl: a.job.url,
      coverLetterText: a.coverLetterText,
      hasCvDocx: a.hasCvDocx,
      hasCoverLetterDocx: a.hasCoverLetterDocx,
      hasCvPdf: a.hasCvPdf,
      cvLanguage: a.cvLanguage,
      backendStatus: a.status,
    })) ?? [];

  // Solo dati reali. Niente padding con mock (utenti nuovi vedono stato vuoto).
  const allRows: Row[] = realRows;
  const filtered = filter === "all" ? allRows : allRows.filter((a) => a.status === filter);

  const awaitingCount = allRows.filter(
    (a) => a.backendStatus === "awaiting_consent",
  ).length;

  const counts = {
    all: allRows.length,
    inviata: allRows.filter((a) => a.status === "inviata").length,
    vista: allRows.filter((a) => a.status === "vista").length,
    colloquio: allRows.filter((a) => a.status === "colloquio").length,
    offerta: allRows.filter((a) => a.status === "offerta").length,
    rifiutata: allRows.filter((a) => a.status === "rifiutata").length,
    awaiting: awaitingCount,
  };

  async function consentAll() {
    if (awaitingCount === 0) return;
    const ok = window.confirm(
      `Confermi l'invio di ${awaitingCount} candidature in attesa?`,
    );
    if (!ok) return;
    try {
      const res = await fetch("/api/applications/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Errore");
        return;
      }
      toast.success(`${body.enqueued} candidature accodate`);
    } catch {
      toast.error("Errore di rete");
    }
  }

  async function consentOne(id: string) {
    try {
      const res = await fetch("/api/applications/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) {
        toast.error("Errore");
        return;
      }
      toast.success("Candidatura accodata");
    } catch {
      toast.error("Errore di rete");
    }
  }

  return (
    <>
      <AppTopbar title="Candidature" breadcrumb="Lavoro" />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
            >
              Candidature
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
              {allRows.length} {allRows.length === 1 ? "candidatura" : "candidature"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="ds-btn"
              type="button"
              disabled={allRows.length === 0}
              onClick={() => exportCsv(allRows)}
            >
              <Icon name="download" size={13} /> Esporta CSV
            </button>
          </div>
        </div>

        {awaitingCount > 0 && (
          <div
            className="mb-4 flex items-center justify-between gap-3 flex-wrap"
            style={{
              padding: "12px 16px",
              background: "var(--primary-weak)",
              border: "1px solid var(--primary-ds)",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--fg)" }}>
              <strong>{awaitingCount}</strong>{" "}
              {awaitingCount === 1
                ? "candidatura in attesa del tuo consenso"
                : "candidature in attesa del tuo consenso"}
              {" · "}
              <span style={{ color: "var(--fg-muted)" }}>
                (modalità ibrida attiva)
              </span>
            </div>
            <button
              type="button"
              className="ds-btn ds-btn-accent"
              onClick={consentAll}
            >
              <Icon name="check" size={13} /> Consenti tutte
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap" }}>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            Tutte <FilterCount>{counts.all}</FilterCount>
          </FilterButton>
          <FilterButton active={filter === "inviata"} onClick={() => setFilter("inviata")}>
            Inviate <FilterCount>{counts.inviata}</FilterCount>
          </FilterButton>
          <FilterButton active={filter === "rifiutata"} onClick={() => setFilter("rifiutata")}>
            Non riuscite <FilterCount>{counts.rifiutata}</FilterCount>
          </FilterButton>
        </div>

        <div className="ds-section-card">
          <table className="ds-tbl">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Azienda · Ruolo</th>
                <th>Luogo</th>
                <th>RAL</th>
                <th>Match</th>
                <th>Fonte</th>
                <th>Stato</th>
                <th>Inviata</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} onClick={() => setSelected(a)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo company={a.company} color={a.color} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{a.company}</div>
                        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                          {a.role}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-muted)" }}>
                    {a.location} · {a.mode}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{a.salary}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 46,
                          height: 4,
                          background: "var(--bg-sunken)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${a.match}%`,
                            height: "100%",
                            background:
                              a.match >= 85
                                ? "var(--primary-ds)"
                                : a.match >= 75
                                  ? "var(--amber)"
                                  : "var(--fg-subtle)",
                          }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {a.match}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-muted)", fontSize: 12 }}>{a.source}</td>
                  <td>
                    {a.backendStatus === "awaiting_consent" ? (
                      <span
                        className="ds-chip"
                        style={{
                          background: "var(--primary-weak)",
                          color: "var(--primary-ds)",
                          fontWeight: 500,
                        }}
                      >
                        attesa consenso
                      </span>
                    ) : (
                      <StatusChip status={a.status} />
                    )}
                  </td>
                  <td style={{ color: "var(--fg-muted)", fontSize: 12 }}>{a.applied}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {a.backendStatus === "awaiting_consent" ? (
                      <button
                        type="button"
                        className="ds-btn ds-btn-sm ds-btn-primary"
                        onClick={() => consentOne(a.id)}
                        style={{ fontSize: 11.5, padding: "4px 10px" }}
                      >
                        <Icon name="check" size={11} /> Consenti
                      </button>
                    ) : (
                      <Icon
                        name="chevron-right"
                        size={14}
                        style={{ color: "var(--fg-subtle)" }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DetailDrawer app={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-btn ds-btn-sm ${active ? "ds-btn-primary" : "ds-btn-ghost"}`}
    >
      {children}
    </button>
  );
}

function FilterCount({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono"
      style={{ opacity: 0.6, fontSize: 11, marginLeft: 6 }}
    >
      {children}
    </span>
  );
}

function exportCsv(rows: Row[]): void {
  if (rows.length === 0) return;
  const header = ["Azienda", "Ruolo", "Luogo", "Modalità", "Fonte", "Stato", "Match", "Inviata"];
  const body = rows.map((r) => [
    r.company,
    r.role,
    r.location,
    r.mode,
    r.source,
    r.status,
    String(r.match),
    r.applied,
  ]);
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [header, ...body]
    .map((row) => row.map(escape).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `lavorai-candidature-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function backendToStatus(b: string): Row["status"] {
  if (b === "success") return "inviata";
  if (b === "failed") return "rifiutata";
  return "inviata";
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function relativeTime(d: Date): string {
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${diffH === 1 ? "ora" : "ore"} fa`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Ieri";
  return `${diffD} giorni fa`;
}

