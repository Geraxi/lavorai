"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
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

export function PreferencesClient({ initial }: { initial: Initial }) {
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
          maxWidth: 1480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.022em",
                margin: 0,
              }}
            >
              Preferenze di candidatura
            </h1>
            <p
              style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}
            >
              LavorAI candiderà solo per gli annunci che corrispondono a questi
              criteri.
            </p>
          </div>
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

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}
        >
          <div className="flex flex-col" style={{ gap: 16 }}>
            {/* Sessioni di candidatura */}
            <SessionsBlock />

            {/* Auto-apply */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="zap" size={14} />}
                title="Modalità auto-apply"
              />
              <SectionBody flush={false}>
                {/* Mode picker — 4 card, attiva quella selezionata */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  {(
                    [
                      {
                        id: "off",
                        title: "Off",
                        sub: "Stop totale. Nessuna candidatura verrà inviata.",
                        icon: "pause-circle" as const,
                      },
                      {
                        id: "manual",
                        title: "Manuale",
                        sub: "Ogni candidatura richiede il tuo consenso.",
                        icon: "check" as const,
                      },
                      {
                        id: "hybrid",
                        title: "Ibrido",
                        sub: `Auto se match ≥ ${matchMin}%, altrimenti chiede consenso.`,
                        icon: "sparkles" as const,
                      },
                      {
                        id: "auto",
                        title: "Full auto",
                        sub: "LavorAI candida da sé. Salta job sotto soglia match.",
                        icon: "zap" as const,
                      },
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
                          background: active
                            ? "var(--primary-weak)"
                            : "var(--bg)",
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
                            marginTop: 4,
                            lineHeight: 1.4,
                          }}
                        >
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {(autoMode === "manual" || autoMode === "hybrid") && (
                  <div
                    style={{
                      background: "var(--bg-sunken)",
                      border: "1px solid var(--border-ds)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      marginBottom: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {autoMode === "manual" ? (
                      <>
                        Ogni candidatura finisce su{" "}
                        <strong style={{ color: "var(--fg)" }}>/applications</strong>{" "}
                        con stato &ldquo;attesa consenso&rdquo;. Premi{" "}
                        <strong style={{ color: "var(--fg)" }}>Consenti</strong>{" "}
                        (o &ldquo;Consenti tutte&rdquo;) per autorizzarne
                        l&apos;invio.
                      </>
                    ) : (
                      <>
                        I job con match ≥{" "}
                        <strong style={{ color: "var(--fg)" }}>{matchMin}%</strong>{" "}
                        vengono inviati automaticamente. Quelli con match inferiore
                        restano in attesa del tuo consenso su{" "}
                        <strong style={{ color: "var(--fg)" }}>/applications</strong>.
                      </>
                    )}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                  }}
                >
                  <div>
                    <label className="ds-label">
                      Candidature / giorno massimo ·{" "}
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
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        marginTop: 8,
                      }}
                    >
                      Il limite consigliato è 20–30 per evitare filtri
                      anti-spam.
                    </div>
                  </div>
                  <div>
                    <label className="ds-label">
                      Match minimo per candidarsi
                    </label>
                    <div
                      className="ds-toggle-group"
                      style={{ display: "flex", width: "100%" }}
                    >
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
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        marginTop: 6,
                        lineHeight: 1.45,
                      }}
                    >
                      Consigliato <strong>50%</strong> per cominciare.
                      Alzalo se vedi candidature a ruoli poco pertinenti;
                      abbassalo se non arrivano candidature.
                    </p>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <label className="ds-label">
                      Tipologia di lavoro
                    </label>
                    <div
                      className="ds-toggle-group"
                      style={{ display: "flex", width: "100%" }}
                    >
                      {[
                        { v: "employee", label: "Dipendente" },
                        { v: "piva", label: "P.IVA / Freelance" },
                        { v: "both", label: "Entrambi" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          className={
                            employmentType === o.v ? "active" : undefined
                          }
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
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        marginTop: 6,
                        lineHeight: 1.45,
                      }}
                    >
                      {employmentType === "piva"
                        ? "Cerchiamo solo contract / freelance / progetti (P.IVA)."
                        : employmentType === "both"
                          ? "Cerchiamo sia posizioni da dipendente sia progetti P.IVA."
                          : "Cerchiamo solo posizioni full-time da dipendente."}
                    </p>
                  </div>

                  {(employmentType === "piva" ||
                    employmentType === "both") && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        borderRadius: 8,
                        background: "var(--bg-elev)",
                        border: "1px solid var(--border-ds)",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Profilo P.IVA
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--fg-muted)",
                          }}
                        >
                          Dettagli usati nel pitch commerciale generato per
                          ogni progetto freelance. Tutti opzionali ma
                          consigliati — un pitch con tariffa e disponibilità
                          converte meglio.
                        </div>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <div>
                          <label className="ds-label">
                            Tariffa giornaliera (€)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="5000"
                            step="50"
                            placeholder="es. 450"
                            value={dailyRate}
                            onChange={(e) => {
                              setDailyRate(e.target.value);
                              mark();
                            }}
                            className="ds-input"
                          />
                        </div>
                        <div>
                          <label className="ds-label">Disponibile dal</label>
                          <input
                            type="text"
                            placeholder="es. immediata, 2 settimane, 1/6/2026"
                            value={availableFrom}
                            onChange={(e) => {
                              setAvailableFrom(e.target.value);
                              mark();
                            }}
                            className="ds-input"
                            maxLength={60}
                          />
                        </div>
                        <div>
                          <label className="ds-label">
                            Partita IVA{" "}
                            <span
                              style={{
                                fontWeight: 400,
                                color: "var(--fg-muted)",
                              }}
                            >
                              (opzionale)
                            </span>
                          </label>
                          <input
                            type="text"
                            placeholder="IT12345678901"
                            value={vatNumber}
                            onChange={(e) => {
                              setVatNumber(e.target.value);
                              mark();
                            }}
                            className="ds-input"
                            maxLength={30}
                          />
                        </div>
                        <div>
                          <label className="ds-label">Portfolio URL</label>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={portfolioUrl}
                            onChange={(e) => {
                              setPortfolioUrl(e.target.value);
                              mark();
                            }}
                            className="ds-input"
                            maxLength={300}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SectionBody>
            </SectionCard>

            {/* Risposte standard candidature */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="check" size={14} />}
                title="Risposte standard candidature"
              />
              <SectionBody>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 18 }}>
                  Domande tipiche dei form ATS — riempite in automatico ad ogni candidatura. Tutto opzionale, ma più ne compili, più candidature passeranno il filtro recruiter.
                </p>
                <div style={{ display: "grid", gap: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label className="ds-label">Autorizzazione lavoro UE</label>
                      <select
                        className="ds-input"
                        value={answers.workAuthEU ?? ""}
                        onChange={(e) =>
                          setAnswer(
                            "workAuthEU",
                            (e.target.value || undefined) as
                              | typeof answers.workAuthEU
                              | undefined,
                          )
                        }
                      >
                        <option value="">— non specificato —</option>
                        <option value="yes_eu_citizen">Cittadino UE</option>
                        <option value="yes_permit">Ho permesso di lavoro UE</option>
                        <option value="no_needs_sponsorship">Mi serve sponsorship</option>
                      </select>
                    </div>
                    <div>
                      <label className="ds-label">Notice period</label>
                      <select
                        className="ds-input"
                        value={answers.noticePeriod ?? ""}
                        onChange={(e) =>
                          setAnswer(
                            "noticePeriod",
                            (e.target.value || undefined) as
                              | typeof answers.noticePeriod
                              | undefined,
                          )
                        }
                      >
                        <option value="">— non specificato —</option>
                        <option value="immediate">Immediata</option>
                        <option value="2weeks">2 settimane</option>
                        <option value="1month">1 mese</option>
                        <option value="2months">2 mesi</option>
                        <option value="3months_plus">3 mesi o più</option>
                      </select>
                    </div>
                    <div>
                      <label className="ds-label">Aspettativa RAL (€/anno)</label>
                      <input
                        type="number"
                        min="0"
                        max="500000"
                        step="1000"
                        className="ds-input"
                        placeholder="es. 60000"
                        value={answers.salaryExpectationEur ?? ""}
                        onChange={(e) =>
                          setAnswer(
                            "salaryExpectationEur",
                            e.target.value
                              ? Math.max(0, parseInt(e.target.value, 10) || 0)
                              : undefined,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="ds-label">Disponibile a trasferirti</label>
                      <select
                        className="ds-input"
                        value={
                          answers.relocate === undefined
                            ? ""
                            : answers.relocate
                              ? "yes"
                              : "no"
                        }
                        onChange={(e) =>
                          setAnswer(
                            "relocate",
                            e.target.value === ""
                              ? undefined
                              : e.target.value === "yes",
                          )
                        }
                      >
                        <option value="">— non specificato —</option>
                        <option value="yes">Sì</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div>
                      <label className="ds-label">LinkedIn URL</label>
                      <input
                        type="url"
                        className="ds-input"
                        placeholder="https://linkedin.com/in/..."
                        value={answers.linkedinUrl ?? ""}
                        onChange={(e) =>
                          setAnswer("linkedinUrl", e.target.value || undefined)
                        }
                        maxLength={300}
                      />
                    </div>
                    <div>
                      <label className="ds-label">GitHub URL</label>
                      <input
                        type="url"
                        className="ds-input"
                        placeholder="https://github.com/..."
                        value={answers.githubUrl ?? ""}
                        onChange={(e) =>
                          setAnswer("githubUrl", e.target.value || undefined)
                        }
                        maxLength={300}
                      />
                    </div>
                    <div>
                      <label className="ds-label">Come ci hai conosciuto</label>
                      <select
                        className="ds-input"
                        value={answers.howHeard ?? ""}
                        onChange={(e) =>
                          setAnswer(
                            "howHeard",
                            (e.target.value || undefined) as
                              | typeof answers.howHeard
                              | undefined,
                          )
                        }
                      >
                        <option value="">— non specificato —</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="google">Google / Search</option>
                        <option value="referral">Referral / Passaparola</option>
                        <option value="other">Altro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="ds-label">
                      Perché ti interessa questo tipo di ruolo (1-2 frasi)
                    </label>
                    <textarea
                      className="ds-input"
                      rows={3}
                      maxLength={500}
                      placeholder="es. Mi piace lavorare a prodotti che semplificano la vita degli utenti. Cerco un team che mette la qualità del design al centro."
                      value={answers.whyInterested ?? ""}
                      onChange={(e) =>
                        setAnswer("whyInterested", e.target.value || undefined)
                      }
                    />
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        marginTop: 4,
                      }}
                    >
                      Generica, non per uno specifico annuncio. Claude la
                      riadatta nel cover letter.
                    </p>
                  </div>
                  {/* EEO collapsible */}
                  <details
                    style={{
                      borderTop: "1px solid var(--border-ds)",
                      paddingTop: 14,
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--fg-muted)",
                      }}
                    >
                      Domande EEO US-style (opzionali, default = preferisco non
                      rispondere)
                    </summary>
                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 14,
                      }}
                    >
                      {(
                        [
                          {
                            k: "eeoGender",
                            label: "Genere",
                            options: [
                              ["", "—"],
                              ["male", "Uomo"],
                              ["female", "Donna"],
                              ["non_binary", "Non binario"],
                              ["prefer_not", "Preferisco non rispondere"],
                            ],
                          },
                          {
                            k: "eeoVeteran",
                            label: "Stato veterano",
                            options: [
                              ["", "—"],
                              ["yes", "Sì"],
                              ["no", "No"],
                              ["prefer_not", "Preferisco non rispondere"],
                            ],
                          },
                          {
                            k: "eeoDisability",
                            label: "Disabilità",
                            options: [
                              ["", "—"],
                              ["yes", "Sì"],
                              ["no", "No"],
                              ["prefer_not", "Preferisco non rispondere"],
                            ],
                          },
                        ] as const
                      ).map((f) => (
                        <div key={f.k}>
                          <label className="ds-label">{f.label}</label>
                          <select
                            className="ds-input"
                            value={(answers[f.k] as string | undefined) ?? ""}
                            onChange={(e) =>
                              setAnswer(
                                f.k,
                                (e.target.value || undefined) as never,
                              )
                            }
                          >
                            {f.options.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </SectionBody>
            </SectionCard>

            {/* Ruoli */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="briefcase" size={14} />}
                title={`Ruoli monitorati (${roles.length})`}
              />
              <SectionBody>
                <div className="flex flex-wrap items-center gap-1.5">
                  {roles.map((r) => (
                    <span
                      key={r}
                      className="ds-chip"
                      style={{ padding: "5px 10px" }}
                    >
                      {r}
                      <button
                        type="button"
                        onClick={() => removeChip(setRoles, r)}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          marginLeft: 4,
                          cursor: "pointer",
                          color: "inherit",
                        }}
                        aria-label={`Rimuovi ${r}`}
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="ds-input"
                    placeholder="+ Aggiungi ruolo, Invio"
                    style={{ width: 220, fontSize: 12, padding: "6px 10px" }}
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChip(setRoles, roleInput, () => setRoleInput(""));
                      }
                    }}
                  />
                </div>
              </SectionBody>
            </SectionCard>

            {/* Sedi & modalità */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="map-pin" size={14} />}
                title="Sedi & modalità"
              />
              <SectionBody>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {(["remoto", "ibrido", "sede"] as const).map((m) => {
                    const on = modeSel[m];
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => {
                          setModeSel((s) => ({ ...s, [m]: !s[m] }));
                          mark();
                        }}
                        className={`ds-pref-card${on ? " selected" : ""}`}
                        style={{
                          textAlign: "left",
                          cursor: "pointer",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        >
                          {m}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {locations.map((l) => (
                    <span
                      key={l}
                      className="ds-chip"
                      style={{ padding: "5px 10px" }}
                    >
                      {l}
                      <button
                        type="button"
                        onClick={() => removeChip(setLocations, l)}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          marginLeft: 4,
                          cursor: "pointer",
                          color: "inherit",
                        }}
                        aria-label={`Rimuovi ${l}`}
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="ds-input"
                    placeholder="+ Aggiungi città, Invio"
                    style={{ width: 220, fontSize: 12, padding: "6px 10px" }}
                    value={locInput}
                    onChange={(e) => setLocInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChip(setLocations, locInput, () => setLocInput(""));
                      }
                    }}
                  />
                </div>
              </SectionBody>
            </SectionCard>

            {/* Compenso */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="euro" size={14} />}
                title="Compenso"
              />
              <SectionBody>
                <label className="ds-label">
                  RAL minima ·{" "}
                  <span className="mono" style={{ color: "var(--fg)" }}>
                    €{salary}k
                  </span>
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
                <div
                  className="mono flex justify-between"
                  style={{
                    fontSize: 11,
                    color: "var(--fg-subtle)",
                    marginTop: 4,
                  }}
                >
                  <span>€20k</span>
                  <span>€80k</span>
                  <span>€150k+</span>
                </div>
              </SectionBody>
            </SectionCard>

            {/* Aziende escluse */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="x" size={14} />}
                title={`Aziende escluse (${excluded.length})`}
              />
              <SectionBody>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--fg-muted)",
                    marginBottom: 10,
                  }}
                >
                  Non invieremo candidature a queste aziende.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {excluded.map((c) => (
                    <span
                      key={c}
                      className="ds-chip"
                      style={{ padding: "5px 10px" }}
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeChip(setExcluded, c)}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          marginLeft: 4,
                          cursor: "pointer",
                          color: "inherit",
                        }}
                        aria-label={`Rimuovi ${c}`}
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="ds-input"
                    placeholder="+ Aggiungi azienda, Invio"
                    style={{ width: 220, fontSize: 12, padding: "6px 10px" }}
                    value={excludeInput}
                    onChange={(e) => setExcludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChip(setExcluded, excludeInput, () =>
                          setExcludeInput(""),
                        );
                      }
                    }}
                  />
                </div>
              </SectionBody>
            </SectionCard>
          </div>

          <div className="flex flex-col" style={{ gap: 16 }}>
            <SectionCard>
              <SectionHead
                icon={<Icon name="target" size={14} />}
                title="Come funziona"
              />
              <SectionBody>
                <ul
                  style={{
                    fontSize: 12.5,
                    color: "var(--fg-muted)",
                    lineHeight: 1.6,
                    paddingLeft: 16,
                    margin: 0,
                  }}
                >
                  <li>
                    Le tue preferenze filtrano le posizioni nel job board.
                  </li>
                  <li>
                    Modalità attuale:{" "}
                    <strong style={{ color: "var(--fg)" }}>
                      {autoMode === "off"
                        ? "Off — nessun invio"
                        : autoMode === "manual"
                          ? "Manuale — consenso per ogni candidatura"
                          : autoMode === "hybrid"
                            ? `Ibrido — auto se match ≥ ${matchMin}%`
                            : `Full auto — fino a ${dailyCap}/giorno sopra ${matchMin}%`}
                    </strong>
                    .
                  </li>
                  <li>Le aziende escluse vengono sempre saltate.</li>
                  <li>
                    Ogni modifica qui richiede il bottone "Salva" in alto a
                    destra.
                  </li>
                </ul>
              </SectionBody>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
