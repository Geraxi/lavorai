import type { AdminPreferenceMetrics } from "@/lib/admin-preference-metrics";
import type { ReactNode } from "react";
import { FunnelBar, Kpi } from "../_ui";

const number = (value: number) => value.toLocaleString("it-IT");
const percent = (value: number) => `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

export function AdminPreferenceKpis({ metrics: m, includeTest, actions }: { metrics: AdminPreferenceMetrics & { excludedInternalUsers?: number }; includeTest: boolean; actions?: ReactNode }) {
  return <section id="preferenze" className="adm-card" aria-labelledby="desired-preferences-title">
    <div className="adm-card-head" style={{ flexWrap: "wrap" }}><div>
      <h2 id="desired-preferences-title" className="adm-card-title">Dove vogliono candidarsi</h2>
      <p className="adm-card-sub">Ruoli salvati nelle preferenze attuali. Nessun conteggio tratto dalla storia lavorativa o dalle candidature inviate.</p>
    </div>{actions}</div>
    <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
      Base: <b>{number(m.totalUsers)} utenti distinti</b>, iscritti in qualsiasi data. Questa sezione mostra le preferenze attuali di tutti gli account: il periodo selezionato in alto si applica alle metriche di prodotto precedenti.
      {includeTest
        ? ` Inclusi ${number(m.realUsers)} utenti reali e ${number(m.internalUsers)} account interni/test.`
        : ` ${number(m.excludedInternalUsers ?? 0)} account interni/test esclusi con la stessa definizione della lista utenti.`}
      {" "}Le percentuali usano questa base, inclusi gli utenti senza preferenze.
    </p>
    <div className="adm-preference-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
      <Kpi label="Preferenze compilate" value={percent(m.coveragePercent)} sub={`${number(m.withRoles)} su ${number(m.totalUsers)} utenti con almeno una voce testuale`} tone="good" />
      <Kpi label="Senza preferenze di ruolo" value={number(m.withoutRoles)} sub={`${percent(m.totalUsers ? m.withoutRoles / m.totalUsers * 100 : 0)} della base`} tone={m.withoutRoles ? "warn" : undefined} />
      <Kpi label="Copertura classificazione" value={percent(m.classificationPercent)} sub={`${number(m.classifiedUsers)} utenti con almeno un ruolo riconosciuto`} />
      <Kpi label="Settori desiderati" value="Non raccolti" sub={`${number(m.sectors.missingUsers)} utenti senza un settore dichiarato`} />
    </div>
    <div style={{ marginTop: 16 }}>
      <h3 className="adm-card-title">Ruoli salvati nelle preferenze</h3>
      <p className="adm-card-sub" style={{ lineHeight: 1.6, marginBottom: 8 }}>
        Ogni utente conta una sola volta per ruolo. La selezione è multipla: lo stesso utente può comparire in più categorie e la somma delle percentuali può superare il 100%.
        {" "}L&apos;onboarding può preselezionare suggerimenti AI ricavati dal CV e salvati alla conferma: il dato non distingue suggerimenti accettati e inserimenti manuali.
      </p>
      {m.roles.length ? <Distribution rows={m.roles.map((row) => ({ ...row, label: row.role }))} total={m.totalUsers} label="Ruolo" /> : <p style={{ color: "var(--fg-subtle)", fontSize: 12, padding: "12px 0" }}>
        {m.totalUsers ? "Nessun ruolo riconosciuto nel catalogo per gli account inclusi." : "Nessun utente nella base selezionata."}
      </p>}
      <p style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, marginTop: 10 }}>
        Senza ruoli: {number(m.missingPreferences)} senza preferenze salvate; {number(m.emptyRoles)} con elenco vuoto o soli spazi; {number(m.invalidWithoutRoles)} con dati non validi e nessun ruolo utilizzabile.
        {m.invalidRoleData > 0 && <> Dati da verificare: {number(m.invalidRoleData)} utenti con JSON o voci non validi; eventuali ruoli testuali validi sono conteggiati.</>}
      </p>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, marginTop: 8 }}>
        Non classificati: {number(m.unclassifiedUsers)} utenti ({percent(m.totalUsers ? m.unclassifiedUsers / m.totalUsers * 100 : 0)}) con almeno una voce fuori catalogo; {number(m.unclassifiedOnlyUsers)} con sole voci fuori catalogo.
        {" "}{number(m.unclassifiedPairs)} coppie utente-voce non classificate. Questi utenti restano nella base e possono avere anche ruoli riconosciuti.
      </p>
      <details style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 8 }}>
        <summary style={{ cursor: "pointer" }}>Metodo di classificazione · catalogo v1</summary>
        <p style={{ lineHeight: 1.6, marginTop: 6 }}>Mostriamo solo titoli professionali presenti in un catalogo esplicito e incompleto, con corrispondenza esatta dopo aver normalizzato maiuscole/minuscole, spazi e varianti Unicode. Sinonimi, lingue e titoli composti non vengono accorpati. Le voci sconosciute, anche se contengono un titolo noto, non sono mostrate né interpretate: potrebbero contenere testo personale o non professionale.</p>
      </details>
    </div>
    <div style={{ borderTop: "1px solid var(--border-ds)", paddingTop: 12, marginTop: 16 }}>
      <h3 className="adm-card-title">Aree professionali derivate dai ruoli</h3>
      <p className="adm-card-sub" style={{ lineHeight: 1.6, marginBottom: 8 }}>Raggruppamenti del catalogo, non settori scelti dagli utenti. Ogni utente conta una volta per area anche con più ruoli nella stessa area. Le aree possono sovrapporsi: la somma delle percentuali può superare il 100%. Base: tutti i {number(m.totalUsers)} utenti inclusi.</p>
      {m.areas.length ? <Distribution rows={m.areas.map((row) => ({ ...row, label: row.area }))} total={m.totalUsers} label="Area derivata" /> : <p style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Nessuna area classificabile dai ruoli salvati.</p>}
    </div>
    <div style={{ borderTop: "1px solid var(--border-ds)", paddingTop: 12, marginTop: 12 }}>
      <h3 className="adm-card-title">Settori desiderati · dati non disponibili</h3>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, marginTop: 4 }}>
        Il prodotto non raccoglie una preferenza esplicita sul settore. Copertura: 0 su {number(m.totalUsers)} utenti{m.totalUsers ? " (0%)" : ""}.
        {" "}Conteggi e percentuali per settore non sono disponibili. Per misurarli serve una nuova scelta dei settori nelle preferenze; non vengono dedotti dal CV o dai ruoli.
      </p>
    </div>
    <style>{`
      @media (max-width: 640px) {
        .adm-preference-distribution li > div {
          grid-template-columns: minmax(0, 1fr) 46px 48px 50px !important;
          gap: 8px !important;
        }
        .adm-preference-distribution li > div > div:first-child {
          white-space: normal !important;
          overflow-wrap: anywhere;
        }
      }
    `}</style>
  </section>;
}

function Distribution({ rows, total, label }: { rows: { label: string; users: number; percent: number }[]; total: number; label: string }) {
  return <div className="adm-preference-distribution" style={{ overflowX: "auto" }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-subtle)", padding: "8px 0" }}><span>{label}</span><span>Utenti distinti · % della base</span></div>
      <ul aria-label={label} style={{ maxHeight: 320, overflowY: "auto", listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => <li key={row.label} title={row.label}>
          <FunnelBar label={row.label} value={row.users} max={total} pct={percent(row.percent)} color="hsl(var(--primary))" />
        </li>)}
      </ul>
    </div>
  </div>;
}
