"use client";

import { useState } from "react";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { LOCATION_PREFS, ROLE_PREFERENCES } from "@/lib/ui-applications";

type RolePref = (typeof ROLE_PREFERENCES)[number];
type LocationPref = (typeof LOCATION_PREFS)[number];

export default function PreferencesPage() {
  const [roles, setRoles] = useState<RolePref[]>(ROLE_PREFERENCES);
  const [locations, setLocations] = useState<LocationPref[]>(LOCATION_PREFS);
  const [salary, setSalary] = useState(50);
  const [autoApply, setAutoApply] = useState(true);
  const [dailyCap, setDailyCap] = useState(25);
  const [matchMin, setMatchMin] = useState(1);
  const [sources, setSources] = useState<Record<string, boolean>>({
    LinkedIn: true,
    Indeed: true,
    "Welcome to the Jungle": true,
    InfoJobs: true,
    Monster: false,
    "Subito Lavoro": true,
    AngelList: true,
    "Siti aziendali (ATS)": true,
  });

  return (
    <>
      <AppTopbar title="Preferenze" breadcrumb="Profilo" />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <div className="mb-6">
          <h1
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
          >
            Preferenze di candidatura
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            LavorAI applicherà solo agli annunci che corrispondono a questi
            criteri.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div className="flex flex-col" style={{ gap: 16 }}>
            <SectionCard>
              <SectionHead
                icon={<Icon name="zap" size={14} />}
                title="Auto-apply"
                actions={
                  <button
                    type="button"
                    className={`ds-toggle${autoApply ? " on" : ""}`}
                    onClick={() => setAutoApply(!autoApply)}
                    aria-label="Toggle auto-apply"
                  />
                }
              />
              <SectionBody
                className="grid gap-5"
                flush={false}
              >
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
                      onChange={(e) => setDailyCap(Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        marginTop: 8,
                      }}
                    >
                      Il limite consigliato è 20–30 per evitare filtri anti-spam.
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
                      {["70%", "75%", "80%", "85%"].map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          className={i === matchMin ? "active" : undefined}
                          style={{ flex: 1 }}
                          onClick={() => setMatchMin(i)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        marginTop: 8,
                      }}
                    >
                      Al di sotto, LavorAI te lo mostrerà senza candidarsi.
                    </div>
                  </div>
                </div>
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHead
                icon={<Icon name="briefcase" size={14} />}
                title="Ruoli monitorati"
                actions={
                  <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost">
                    <Icon name="plus" size={11} /> Aggiungi
                  </button>
                }
              />
              <SectionBody>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                  }}
                >
                  {roles.map((r, i) => (
                    <div
                      key={r.title}
                      className={`ds-pref-card${r.selected ? " selected" : ""}`}
                      onClick={() =>
                        setRoles((rs) =>
                          rs.map((x, j) =>
                            j === i ? { ...x, selected: !x.selected } : x,
                          ),
                        )
                      }
                    >
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.title}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                      >
                        {r.count.toLocaleString("it")} annunci attivi
                      </div>
                    </div>
                  ))}
                </div>
              </SectionBody>
            </SectionCard>

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
                  }}
                >
                  {locations.map((l, i) => (
                    <div
                      key={l.city}
                      className={`ds-pref-card${l.selected ? " selected" : ""}`}
                      onClick={() =>
                        setLocations((ls) =>
                          ls.map((x, j) =>
                            j === i ? { ...x, selected: !x.selected } : x,
                          ),
                        )
                      }
                    >
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {l.city}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                      >
                        {l.count.toLocaleString("it")} annunci
                      </div>
                    </div>
                  ))}
                </div>
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHead icon={<Icon name="euro" size={14} />} title="Compenso" />
              <SectionBody>
                <label className="ds-label">
                  RAL minima ·{" "}
                  <span className="mono" style={{ color: "var(--fg)" }}>
                    €{salary}k
                  </span>
                </label>
                <input
                  type="range"
                  min="25"
                  max="120"
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
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
                  <span>€25k</span>
                  <span>€70k</span>
                  <span>€120k+</span>
                </div>
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHead icon={<Icon name="x" size={14} />} title="Escludi aziende" />
              <SectionBody>
                <div className="flex flex-wrap gap-1.5">
                  {["Amazon Italy", "Poste Italiane", "Vecchio Datore SrL"].map(
                    (c) => (
                      <span key={c} className="ds-chip" style={{ padding: "5px 10px" }}>
                        {c}{" "}
                        <Icon name="x" size={10} style={{ marginLeft: 4 }} />
                      </span>
                    ),
                  )}
                  <input
                    className="ds-input"
                    placeholder="+ Aggiungi azienda"
                    style={{ width: 200, fontSize: 12, padding: "4px 10px" }}
                  />
                </div>
              </SectionBody>
            </SectionCard>
          </div>

          <div className="flex flex-col" style={{ gap: 16 }}>
            <SectionCard>
              <SectionHead icon={<Icon name="target" size={14} />} title="Stima mensile" />
              <SectionBody>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  ~620
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  candidature / mese con queste preferenze
                </div>
                <div
                  style={{
                    height: 1,
                    background: "var(--border-ds)",
                    margin: "14px 0",
                  }}
                />
                <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
                  <KVRow label="Annunci nel bacino" value="4.102" />
                  <KVRow label="Match medio atteso" value="82%" />
                  <KVRow label="Tempo AI / candidatura" value="~14s" />
                  <KVRow label="Tempo risparmiato / mese" value="~72h" />
                </div>
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHead icon={<Icon name="globe" size={14} />} title="Fonti attive" />
              <SectionBody>
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(sources).map(([name, on]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between"
                      style={{ fontSize: 13 }}
                    >
                      <span>{name}</span>
                      <button
                        type="button"
                        aria-label={`toggle ${name}`}
                        className={`ds-toggle${on ? " on" : ""}`}
                        onClick={() =>
                          setSources((s) => ({ ...s, [name]: !s[name] }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </SectionBody>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--fg-muted)" }}>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
