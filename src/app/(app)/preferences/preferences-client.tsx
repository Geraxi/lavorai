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

type AutoMode = "off" | "hybrid" | "auto";

interface Initial {
  roles: string[];
  locations: string[];
  salaryMin: number;
  autoApplyOn: boolean;
  autoApplyMode: AutoMode;
  dailyCap: number;
  matchMin: number;
  modeSel: { remoto: boolean; ibrido: boolean; sede: boolean };
  excludedCompanies: string[];
}

const MATCH_STEPS = [70, 75, 80, 85] as const;

export function PreferencesClient({ initial }: { initial: Initial }) {
  const [roles, setRoles] = useState<string[]>(initial.roles);
  const [locations, setLocations] = useState<string[]>(initial.locations);
  const [salary, setSalary] = useState<number>(initial.salaryMin);
  const [autoMode, setAutoMode] = useState<AutoMode>(initial.autoApplyMode);
  const [dailyCap, setDailyCap] = useState<number>(initial.dailyCap);
  const [matchMin, setMatchMin] = useState<number>(initial.matchMin);
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
            {/* Auto-apply */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="zap" size={14} />}
                title="Modalità auto-apply"
              />
              <SectionBody flush={false}>
                {/* Mode picker — 3 card, attiva quella selezionata */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
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
                        id: "hybrid",
                        title: "Ibrido",
                        sub: "Prepariamo tutto. Tu confermi prima dell'invio.",
                        icon: "check" as const,
                      },
                      {
                        id: "auto",
                        title: "Automatico",
                        sub: "LavorAI candida da sé, senza chiedere.",
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
                {autoMode === "hybrid" && (
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
                    In modalità <strong style={{ color: "var(--fg)" }}>Ibrido</strong>{" "}
                    ogni candidatura finisce in coda su{" "}
                    <strong style={{ color: "var(--fg)" }}>/applications</strong> con
                    stato &ldquo;in attesa di consenso&rdquo;. Premi{" "}
                    <strong style={{ color: "var(--fg)" }}>Consenti</strong> per
                    confermarne l&apos;invio.
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
                  </div>
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
                        ? "Off"
                        : autoMode === "hybrid"
                          ? "Ibrido (richiede consenso)"
                          : `Automatica (fino a ${dailyCap}/giorno)`}
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
