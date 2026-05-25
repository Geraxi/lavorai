"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/design/topbar";
import { Icon, type IconName } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { SessionsBlock } from "@/components/sessions-block";

type AutoMode = "off" | "manual" | "hybrid" | "auto";

interface Initial {
  roles: string[];
  locations: string[];
  salaryMin: number;
  autoApplyOn: boolean;
  autoApplyMode: AutoMode;
  dailyCap: number;
  matchMin: number;
  employmentType: "employee" | "piva" | "both";
  dailyRate: number | null;
  availableFrom: string | null;
  vatNumber: string | null;
  portfolioUrl: string | null;
  applicationAnswers: import("@/lib/application-answers").ApplicationAnswers;
  modeSel: { remoto: boolean; ibrido: boolean; sede: boolean };
  excludedCompanies: string[];
}

const MATCH_STEPS = [30, 50, 65, 75, 85] as const;

type TabKey = "auto" | "search" | "form" | "rounds";

export function PreferencesClient({ initial }: { initial: Initial }) {
  const [activeTab, setActiveTab] = useState<TabKey>("auto");
  const [roles, setRoles] = useState<string[]>(initial.roles);
  const [locations, setLocations] = useState<string[]>(initial.locations);
  const [salary, setSalary] = useState<number>(initial.salaryMin);
  const [autoMode, setAutoMode] = useState<AutoMode>(initial.autoApplyMode);
  const [dailyCap, setDailyCap] = useState<number>(initial.dailyCap);
  const [matchMin, setMatchMin] = useState<number>(initial.matchMin);
  const [employmentType, setEmploymentType] = useState<
    "employee" | "piva" | "both"
  >(initial.employmentType);
  const [dailyRate, setDailyRate] = useState<string>(
    initial.dailyRate != null ? String(initial.dailyRate) : "",
  );
  const [availableFrom, setAvailableFrom] = useState<string>(
    initial.availableFrom ?? "",
  );
  const [vatNumber, setVatNumber] = useState<string>(initial.vatNumber ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState<string>(
    initial.portfolioUrl ?? "",
  );
  const [answers, setAnswers] = useState<
    import("@/lib/application-answers").ApplicationAnswers
  >(initial.applicationAnswers);
  const setAnswer = <K extends keyof typeof answers>(
    k: K,
    v: (typeof answers)[K] | undefined,
  ) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    mark();
  };
  const [modeSel, setModeSel] = useState(initial.modeSel);
  const [excluded, setExcluded] = useState<string[]>(initial.excludedCompanies);
  const [roleInput, setRoleInput] = useState("");
  const [locInput, setLocInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  function mark() {
    if (!dirty) setDirty(true);
  }

  function addChip(
    setter: (fn: (s: string[]) => string[]) => void,
    value: string,
    clear: () => void,
  ) {
    const v = value.trim();
    if (!v) return;
    setter((list) =>
      list.some((x) => x.toLowerCase() === v.toLowerCase()) ? list : [...list, v],
    );
    clear();
    mark();
  }

  function removeChip(
    setter: (fn: (s: string[]) => string[]) => void,
    value: string,
  ) {
    setter((list) => list.filter((x) => x !== value));
    mark();
  }

  function save() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roles,
            locations,
            salaryMin: salary,
            modeSel,
            autoApplyOn: autoMode !== "off",
            autoApplyMode: autoMode,
            dailyCap,
            matchMin,
            employmentType,
            dailyRate: dailyRate.trim()
              ? Math.max(0, Math.min(5000, parseInt(dailyRate, 10) || 0))
              : null,
            availableFrom: availableFrom.trim() || null,
            vatNumber: vatNumber.trim() || null,
            portfolioUrl: portfolioUrl.trim() || null,
            applicationAnswers: answers,
            excludedCompanies: excluded,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body?.message ?? "Errore nel salvataggio");
          return;
        }
        toast.success("Preferenze salvate");
        setDirty(false);
      } catch {
        toast.error("Errore di rete");
      }
    });
  }

  return (
    <>
      <AppTopbar title="Preferenze" breadcrumb="Profilo" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 880,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            Preferenze
          </h1>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !dirty}
            className="ds-btn ds-btn-accent"
            style={{ padding: "9px 16px", fontSize: 13 }}
          >
            {isPending ? (
              <>
                <Icon name="refresh" size={13} /> Salvo...
              </>
            ) : dirty ? (
              <>
                <Icon name="check" size={13} /> Salva
              </>
            ) : (
              <>
                <Icon name="check" size={13} /> Salvato
              </>
            )}
          </button>
        </div>

        <PreferencesTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex flex-col" style={{ gap: 16, marginTop: 16 }}>
          {/* ---------------- AUTO-APPLY ---------------- */}
          {activeTab === "auto" && (
            <SectionCard>
              <SectionHead
                icon={<Icon name="zap" size={14} />}
                title="Come candidarsi"
              />
              <SectionBody flush={false}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 8,
                    marginBottom: 18,
                  }}
                >
                  {(
                    [
                      { id: "off", title: "Off", sub: "Nessun invio", icon: "pause-circle" as const },
                      { id: "manual", title: "Manuale", sub: "Chiede sempre conferma", icon: "check" as const },
                      { id: "hybrid", title: "Ibrido", sub: `Auto se match ≥ ${matchMin}%`, icon: "sparkles" as const },
                      { id: "auto", title: "Full auto", sub: "Candida da solo", icon: "zap" as const },
                    ] as const
                  ).map((opt) => {
                    const active = autoMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAutoMode(opt.id);
                          mark();
                        }}
                        className="ds-pref-card"
                        style={{
                          textAlign: "left",
                          padding: 12,
                          cursor: "pointer",
                          border: active
                            ? "1.5px solid var(--primary-ds)"
                            : "1px solid var(--border-ds)",
                          background: active ? "var(--primary-weak)" : "var(--bg)",
                        }}
                      >
                        <div
                          className="flex items-center gap-1.5"
                          style={{ fontSize: 13, fontWeight: 600 }}
                        >
                          <Icon name={opt.icon} size={13} /> {opt.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--fg-muted)",
                            marginTop: 3,
                          }}
                        >
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {autoMode !== "off" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 20,
                    }}
                  >
                    <div>
                      <label className="ds-label">
                        Max al giorno ·{" "}
                        <span className="mono" style={{ color: "var(--fg)" }}>
                          {dailyCap}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="80"
                        value={dailyCap}
                        onChange={(e) => {
                          setDailyCap(Number(e.target.value));
                          mark();
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>
                        Consigliato 20–30.
                      </div>
                    </div>
                    <div>
                      <label className="ds-label">Match minimo</label>
                      <div className="ds-toggle-group" style={{ display: "flex", width: "100%" }}>
                        {MATCH_STEPS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={v === matchMin ? "active" : undefined}
                            style={{ flex: 1 }}
                            onClick={() => {
                              setMatchMin(v);
                              mark();
                            }}
                          >
                            {v}%
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>
                        Consigliato 50%.
                      </div>
                    </div>
                  </div>
                )}
              </SectionBody>
            </SectionCard>
          )}

          {/* ---------------- COSA CERCHI ---------------- */}
          {activeTab === "search" && (
            <SectionCard>
              <SectionBody flush={false}>
                {/* Ruoli */}
                <label className="ds-label">Ruoli ({roles.length})</label>
                <ChipEditor
                  items={roles}
                  onRemove={(r) => removeChip(setRoles, r)}
                  input={roleInput}
                  setInput={setRoleInput}
                  onAdd={() => addChip(setRoles, roleInput, () => setRoleInput(""))}
                  placeholder="+ Ruolo, Invio"
                />

                {/* Dove & come */}
                <label className="ds-label" style={{ marginTop: 22 }}>
                  Dove & come
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {(["remoto", "ibrido", "sede"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setModeSel((s) => ({ ...s, [m]: !s[m] }));
                        mark();
                      }}
                      className={`ds-pref-card${modeSel[m] ? " selected" : ""}`}
                      style={{ textAlign: "center", cursor: "pointer", padding: "9px 12px", textTransform: "capitalize", fontSize: 13, fontWeight: 500 }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <ChipEditor
                  items={locations}
                  onRemove={(l) => removeChip(setLocations, l)}
                  input={locInput}
                  setInput={setLocInput}
                  onAdd={() => addChip(setLocations, locInput, () => setLocInput(""))}
                  placeholder="+ Città, Invio"
                />

                {/* RAL */}
                <label className="ds-label" style={{ marginTop: 22 }}>
                  RAL minima ·{" "}
                  <span className="mono" style={{ color: "var(--fg)" }}>€{salary}k</span>
                </label>
                <input
                  type="range"
                  min="20"
                  max="150"
                  value={salary}
                  onChange={(e) => {
                    setSalary(Number(e.target.value));
                    mark();
                  }}
                  style={{ width: "100%" }}
                />

                {/* Tipologia */}
                <label className="ds-label" style={{ marginTop: 18 }}>Tipologia</label>
                <div className="ds-toggle-group" style={{ display: "flex", width: "100%" }}>
                  {[
                    { v: "employee", label: "Dipendente" },
                    { v: "piva", label: "P.IVA" },
                    { v: "both", label: "Entrambi" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      className={employmentType === o.v ? "active" : undefined}
                      style={{ flex: 1 }}
                      onClick={() => {
                        setEmploymentType(o.v as typeof employmentType);
                        mark();
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {(employmentType === "piva" || employmentType === "both") && (
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="ds-label">Tariffa/giorno (€)</label>
                      <input type="number" min="0" max="5000" step="50" placeholder="450" value={dailyRate} onChange={(e) => { setDailyRate(e.target.value); mark(); }} className="ds-input" />
                    </div>
                    <div>
                      <label className="ds-label">Disponibile dal</label>
                      <input type="text" placeholder="immediata" value={availableFrom} onChange={(e) => { setAvailableFrom(e.target.value); mark(); }} className="ds-input" maxLength={60} />
                    </div>
                    <div>
                      <label className="ds-label">Partita IVA</label>
                      <input type="text" placeholder="IT123…" value={vatNumber} onChange={(e) => { setVatNumber(e.target.value); mark(); }} className="ds-input" maxLength={30} />
                    </div>
                    <div>
                      <label className="ds-label">Portfolio URL</label>
                      <input type="url" placeholder="https://…" value={portfolioUrl} onChange={(e) => { setPortfolioUrl(e.target.value); mark(); }} className="ds-input" maxLength={300} />
                    </div>
                  </div>
                )}

                {/* Aziende escluse — accordion (uso raro) */}
                <details style={{ marginTop: 20, borderTop: "1px solid var(--border-ds)", paddingTop: 14 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--fg-muted)" }}>
                    Aziende da escludere ({excluded.length})
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    <ChipEditor
                      items={excluded}
                      onRemove={(c) => removeChip(setExcluded, c)}
                      input={excludeInput}
                      setInput={setExcludeInput}
                      onAdd={() => addChip(setExcluded, excludeInput, () => setExcludeInput(""))}
                      placeholder="+ Azienda, Invio"
                    />
                  </div>
                </details>
              </SectionBody>
            </SectionCard>
          )}

          {/* ---------------- FORM RISPOSTE ---------------- */}
          {activeTab === "form" && (
            <SectionCard>
              <SectionHead
                icon={<Icon name="check" size={14} />}
                title="Risposte ai form"
              />
              <SectionBody>
                <p style={{ fontSize: 12.5, color: "var(--fg-muted)", marginBottom: 16 }}>
                  Compilate in automatico sui form di candidatura. Tutto opzionale.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label className="ds-label">Autorizzazione lavoro UE</label>
                    <select className="ds-input" value={answers.workAuthEU ?? ""} onChange={(e) => setAnswer("workAuthEU", (e.target.value || undefined) as typeof answers.workAuthEU | undefined)}>
                      <option value="">—</option>
                      <option value="yes_eu_citizen">Cittadino UE</option>
                      <option value="yes_permit">Ho permesso UE</option>
                      <option value="no_needs_sponsorship">Serve sponsorship</option>
                    </select>
                  </div>
                  <div>
                    <label className="ds-label">Preavviso</label>
                    <select className="ds-input" value={answers.noticePeriod ?? ""} onChange={(e) => setAnswer("noticePeriod", (e.target.value || undefined) as typeof answers.noticePeriod | undefined)}>
                      <option value="">—</option>
                      <option value="immediate">Immediata</option>
                      <option value="2weeks">2 settimane</option>
                      <option value="1month">1 mese</option>
                      <option value="2months">2 mesi</option>
                      <option value="3months_plus">3 mesi+</option>
                    </select>
                  </div>
                  <div>
                    <label className="ds-label">Aspettativa RAL (€/anno)</label>
                    <input type="number" min="0" max="500000" step="1000" className="ds-input" placeholder="60000" value={answers.salaryExpectationEur ?? ""} onChange={(e) => setAnswer("salaryExpectationEur", e.target.value ? Math.max(0, parseInt(e.target.value, 10) || 0) : undefined)} />
                  </div>
                  <div>
                    <label className="ds-label">Disponibile a trasferirti</label>
                    <select className="ds-input" value={answers.relocate === undefined ? "" : answers.relocate ? "yes" : "no"} onChange={(e) => setAnswer("relocate", e.target.value === "" ? undefined : e.target.value === "yes")}>
                      <option value="">—</option>
                      <option value="yes">Sì</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="ds-label">LinkedIn</label>
                    <input type="url" className="ds-input" placeholder="https://linkedin.com/in/…" value={answers.linkedinUrl ?? ""} onChange={(e) => setAnswer("linkedinUrl", e.target.value || undefined)} maxLength={300} />
                  </div>
                  <div>
                    <label className="ds-label">Portfolio / sito</label>
                    <input type="url" className="ds-input" placeholder="https://…" value={answers.portfolioUrl ?? ""} onChange={(e) => setAnswer("portfolioUrl", e.target.value || undefined)} maxLength={300} />
                  </div>
                </div>

                <details style={{ borderTop: "1px solid var(--border-ds)", paddingTop: 14, marginTop: 16 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--fg-muted)" }}>
                    Altre risposte (GitHub, come ci hai conosciuto, EEO)
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                    <div>
                      <label className="ds-label">GitHub</label>
                      <input type="url" className="ds-input" placeholder="https://github.com/…" value={answers.githubUrl ?? ""} onChange={(e) => setAnswer("githubUrl", e.target.value || undefined)} maxLength={300} />
                    </div>
                    <div>
                      <label className="ds-label">Come ci hai conosciuto</label>
                      <select className="ds-input" value={answers.howHeard ?? ""} onChange={(e) => setAnswer("howHeard", (e.target.value || undefined) as typeof answers.howHeard | undefined)}>
                        <option value="">—</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="google">Google</option>
                        <option value="referral">Referral</option>
                        <option value="other">Altro</option>
                      </select>
                    </div>
                    {(
                      [
                        { k: "eeoGender", label: "Genere", options: [["", "—"], ["male", "Uomo"], ["female", "Donna"], ["non_binary", "Non binario"], ["prefer_not", "Non rispondo"]] },
                        { k: "eeoVeteran", label: "Veterano", options: [["", "—"], ["yes", "Sì"], ["no", "No"], ["prefer_not", "Non rispondo"]] },
                        { k: "eeoDisability", label: "Disabilità", options: [["", "—"], ["yes", "Sì"], ["no", "No"], ["prefer_not", "Non rispondo"]] },
                      ] as const
                    ).map((f) => (
                      <div key={f.k}>
                        <label className="ds-label">{f.label}</label>
                        <select className="ds-input" value={(answers[f.k] as string | undefined) ?? ""} onChange={(e) => setAnswer(f.k, (e.target.value || undefined) as never)}>
                          {f.options.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </details>
              </SectionBody>
            </SectionCard>
          )}

          {/* ---------------- ROUND ATTIVI ---------------- */}
          {activeTab === "rounds" && <SessionsBlock />}
        </div>
      </div>
    </>
  );
}

/** Chip list + input inline riutilizzabile. */
function ChipEditor({
  items,
  onRemove,
  input,
  setInput,
  onAdd,
  placeholder,
}: {
  items: string[];
  onRemove: (v: string) => void;
  input: string;
  setInput: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <span key={it} className="ds-chip" style={{ padding: "5px 10px" }}>
          {it}
          <button
            type="button"
            onClick={() => onRemove(it)}
            style={{ background: "none", border: 0, padding: 0, marginLeft: 4, cursor: "pointer", color: "inherit" }}
            aria-label={`Rimuovi ${it}`}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        className="ds-input"
        placeholder={placeholder}
        style={{ width: 200, fontSize: 12, padding: "6px 10px" }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
      />
    </div>
  );
}

/** Tab navigation — 4 sezioni invece di 6, nomi più chiari. */
function PreferencesTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (t: TabKey) => void;
}) {
  const tabs: Array<{ key: TabKey; label: string; icon: IconName }> = [
    { key: "auto", label: "Auto-apply", icon: "zap" },
    { key: "search", label: "Cosa cerchi", icon: "briefcase" },
    { key: "form", label: "Risposte", icon: "check" },
    { key: "rounds", label: "Round attivi", icon: "sparkles" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Sezioni preferenze"
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        borderRadius: 10,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === activeTab;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(t.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 14px",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: "nowrap",
              transition: "background 0.12s, color 0.12s",
              background: isActive ? "var(--bg)" : "transparent",
              color: isActive ? "var(--fg)" : "var(--fg-muted)",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
              flex: 1,
              justifyContent: "center",
            }}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
