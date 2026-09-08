"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";

export interface InboxSent {
  id: string;
  status: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  portal: string;
  via: string | null;
  confirmation: string | null;
  date: string;
  answers: { label: string; answer: string; source: string }[];
  pending: string[];
  replyKind: string | null;
  replyCount: number;
  userStatus: string | null;
}
export interface InboxAnswer {
  id: string;
  labelKey: string;
  label: string;
  kind: string;
  options: string[];
  answer: string;
  source: string;
  answeredAt: string | null;
}
export interface InboxReply {
  id: string;
  from: string;
  subject: string | null;
  body: string;
  kind: string;
  date: string;
  applicationId: string;
  company: string;
  title: string;
}

type Tab = "sent" | "answers" | "messages";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SOURCE: Record<string, { label: string; cls: string }> = {
  user: { label: "Tua risposta", cls: "ds-chip-green" },
  profile: { label: "Dal profilo", cls: "ds-chip-blue" },
  rule: { label: "Automatica", cls: "ds-chip-blue" },
  ai: { label: "Risposta AI", cls: "ds-chip-amber" },
};

function cleanLabel(raw: string): string {
  const s = (raw || "").replace(/SVGs? not supported by this browser\.?/gi, " ").split(/\s*\+\d{1,4}[A-Z]/)[0].replace(/\s+/g, " ").replace(/^\*+|\*+$/g, "").trim();
  return s || raw.slice(0, 60);
}

/**
 * Inbox: tre viste in una pagina fit-to-viewport.
 *  - Inviate: candidature inviate con prova di consegna e risposte usate nel form
 *  - Risposte: risposte riutilizzabili (utente/AI), modificabili inline
 *  - Messaggi: risposte reali dei recruiter (webhook email inbound)
 */
export function InboxView({ sent, answers, replies, waiting }: { sent: InboxSent[]; answers: InboxAnswer[]; replies: InboxReply[]; waiting: number }) {
  const [tab, setTab] = useState<Tab>("sent");
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [local, setLocal] = useState(answers);

  const confirmed = useMemo(() => sent.filter((s) => s.status === "success" && (s.confirmation?.startsWith("DETECTED") || s.confirmation === "EMAIL_SENT")), [sent]);
  const delivered = useMemo(() => sent.filter((s) => s.status === "success"), [sent]);
  const blocked = useMemo(() => sent.filter((s) => s.status !== "success"), [sent]);
  const pendingAnswers = local.filter((a) => !a.answer.trim());
  const doneAnswers = local.filter((a) => a.answer.trim());

  async function saveAnswer(a: InboxAnswer) {
    const v = (edit[a.labelKey] ?? a.answer).trim();
    if (!v || v === a.answer) { setEdit((s) => { const n = { ...s }; delete n[a.labelKey]; return n; }); return; }
    setSaving(a.labelKey);
    try {
      const r = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: [{ labelKey: a.labelKey, answer: v }] }) });
      if (r.ok) {
        setLocal((rows) => rows.map((x) => (x.labelKey === a.labelKey ? { ...x, answer: v, source: "user", answeredAt: new Date().toISOString() } : x)));
        setSaved((s) => ({ ...s, [a.labelKey]: "Salvata" }));
        setEdit((s) => { const n = { ...s }; delete n[a.labelKey]; return n; });
        setTimeout(() => setSaved((s) => { const n = { ...s }; delete n[a.labelKey]; return n; }), 2500);
      }
    } finally {
      setSaving(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "sent", label: "Inviate", count: delivered.length },
    { key: "answers", label: "Risposte", count: local.length },
    { key: "messages", label: "Messaggi", count: replies.length },
  ];

  return (
    <div className="fit-page" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
      <div>
        <h1 className="fit-h1">Inbox</h1>
        <p className="fit-hero-sub" style={{ maxWidth: 820 }}>
          Tutto quello che LavorAI ha inviato a tuo nome: candidature consegnate, risposte date nei form e messaggi dei recruiter.
          {waiting > 0 && <> <Link href="/questions" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>{waiting} {waiting === 1 ? "candidatura aspetta" : "candidature aspettano"} una tua risposta →</Link></>}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`ds-btn ds-btn-sm ${tab === t.key ? "ds-btn-primary" : "ds-btn-ghost"}`}>
              {t.label} <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
            </button>
          ))}
        </div>
        {tab === "sent" && (
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
            <strong style={{ color: "var(--fg)" }}>{confirmed.length}</strong> con conferma del portale · <strong style={{ color: "var(--fg)" }}>{delivered.length - confirmed.length}</strong> inviate senza prova
          </div>
        )}
      </div>

      <div className="fit-card" style={{ padding: 0 }}>
        <div className="fit-body fit-scroll">
          {tab === "sent" && (
            delivered.length === 0 && blocked.length === 0 ? (
              <Empty icon="send" title="Nessuna candidatura inviata" sub="Quando LavorAI invia una candidatura la trovi qui, con le risposte usate nel form." cta={{ href: "/discover", label: "Trova opportunità" }} />
            ) : (
              <>
                {blocked.length > 0 && (
                  <div style={{ padding: "10px 18px", background: "hsl(var(--primary)/0.06)", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5, color: "var(--fg-muted)" }}>
                    {blocked.length} {blocked.length === 1 ? "candidatura è pronta ma ferma" : "candidature sono pronte ma ferme"}: {blocked.some((b) => b.status === "needs_answers") ? <Link href="/questions" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>rispondi alle domande</Link> : "completa l'invio dalla pagina Candidature"}.
                  </div>
                )}
                {[...delivered, ...blocked].map((s) => {
                  const isConf = s.confirmation?.startsWith("DETECTED") || s.confirmation === "EMAIL_SENT";
                  const isOpen = open === s.id;
                  return (
                    <div key={s.id} style={{ borderBottom: "1px solid var(--border-ds)" }}>
                      <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "12px 18px", display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 12, alignItems: "center", cursor: "pointer", color: "inherit" }}>
                        <CompanyLogo company={s.company} color={companyColor(s.company)} size={34} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.company}</span>
                            <span style={{ fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                            {s.status === "success" ? (
                              <span className={`ds-chip ${isConf ? "ds-chip-green" : "ds-chip-blue"}`}>{isConf ? (s.confirmation === "EMAIL_SENT" ? "Email consegnata" : "Confermata dal portale") : "Inviata"}</span>
                            ) : s.status === "needs_answers" ? (
                              <span className="ds-chip ds-chip-amber">In attesa di risposte</span>
                            ) : (
                              <span className="ds-chip ds-chip-amber">Da completare</span>
                            )}
                            <span className="ds-chip">{s.portal}</span>
                            {s.answers.length > 0 && <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{s.answers.length} risposte nel form</span>}
                            {s.replyCount > 0 && <span className={`ds-chip ${s.replyKind === "colloquio" ? "ds-chip-green" : s.replyKind === "rifiutata" ? "ds-chip-red" : "ds-chip-blue"}`}>{s.replyKind === "colloquio" ? "Colloquio" : s.replyKind === "rifiutata" ? "Rifiutata" : "Risposta ricevuta"}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
                          {fmt(s.date)}
                          <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={14} />
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "0 18px 14px 64px", display: "grid", gap: 10 }}>
                          {s.answers.length === 0 && s.pending.length === 0 && (
                            <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Nessuna domanda aggiuntiva nel form: sono stati inviati CV, lettera e i dati di contatto.</div>
                          )}
                          {s.answers.map((a, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{cleanLabel(a.label)}</div>
                                <div style={{ fontSize: 13.5, marginTop: 2, whiteSpace: "pre-wrap" }}>{a.answer}</div>
                              </div>
                              <span className={`ds-chip ${SOURCE[a.source]?.cls ?? ""}`}>{SOURCE[a.source]?.label ?? a.source}</span>
                            </div>
                          ))}
                          {s.pending.map((p, i) => (
                            <div key={`p${i}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10 }}>
                              <div style={{ fontSize: 13, color: "#fbbf24" }}>{cleanLabel(p)}</div>
                              <Link href="/questions" className="ds-chip ds-chip-amber">Rispondi</Link>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <a href={s.url} target="_blank" rel="noreferrer" className="ds-btn ds-btn-sm ds-btn-ghost"><Icon name="external" size={12} /> Annuncio</a>
                            <Link href={`/applications?id=${s.id}`} className="ds-btn ds-btn-sm ds-btn-ghost">Dettagli candidatura</Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          )}

          {tab === "answers" && (
            local.length === 0 ? (
              <Empty icon="check" title="Nessuna risposta salvata" sub="Le risposte alle domande dei form (tue o dell'AI) compaiono qui e vengono riusate nelle prossime candidature." />
            ) : (
              <div style={{ padding: "6px 0" }}>
                {pendingAnswers.length > 0 && (
                  <div style={{ padding: "8px 18px", fontSize: 12.5, color: "var(--fg-muted)", borderBottom: "1px solid var(--border-ds)" }}>
                    <strong style={{ color: "#fbbf24" }}>{pendingAnswers.length}</strong> domande senza risposta bloccano delle candidature. <Link href="/questions" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>Rispondi nel wizard →</Link>
                  </div>
                )}
                {[...pendingAnswers, ...doneAnswers].map((a) => {
                  const editing = a.labelKey in edit;
                  const src = SOURCE[a.source] ?? SOURCE.user;
                  return (
                    <div key={a.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-ds)", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{cleanLabel(a.label)}</div>
                        {editing ? (
                          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                            {a.kind === "textarea" || (edit[a.labelKey] ?? a.answer).length > 80 ? (
                              <textarea className="fit-input" rows={4} value={edit[a.labelKey]} onChange={(e) => setEdit((s) => ({ ...s, [a.labelKey]: e.target.value }))} style={{ resize: "vertical" }} />
                            ) : (
                              <>
                                <input className="fit-input" list={a.options.length ? `o-${a.id}` : undefined} value={edit[a.labelKey]} onChange={(e) => setEdit((s) => ({ ...s, [a.labelKey]: e.target.value }))} />
                                {a.options.length > 0 && <datalist id={`o-${a.id}`}>{a.options.map((o) => <option key={o} value={o} />)}</datalist>}
                              </>
                            )}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={saving === a.labelKey} onClick={() => saveAnswer(a)}>{saving === a.labelKey ? "Salvo…" : "Salva"}</button>
                              <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={() => setEdit((s) => { const n = { ...s }; delete n[a.labelKey]; return n; })}>Annulla</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13.5, marginTop: 4, color: a.answer ? "var(--fg)" : "#fbbf24", whiteSpace: "pre-wrap" }}>{a.answer || "Non ancora risposto"}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        {a.answer ? <span className={`ds-chip ${src.cls}`}>{saved[a.labelKey] ?? src.label}</span> : <span className="ds-chip ds-chip-amber">Da rispondere</span>}
                        {!editing && <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={() => setEdit((s) => ({ ...s, [a.labelKey]: a.answer }))}>{a.answer ? "Modifica" : "Rispondi"}</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === "messages" && (
            replies.length === 0 ? (
              <Empty icon="inbox" title="Nessun messaggio dai recruiter" sub="Le risposte alle candidature inviate via email arrivano qui. Per le candidature sui portali ATS le risposte arrivano direttamente alla tua email." />
            ) : (
              replies.map((r) => (
                <div key={r.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-ds)", display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 12 }}>
                  <CompanyLogo company={r.company} color={companyColor(r.company)} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.company}</span>
                      <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{r.title}</span>
                      <span className={`ds-chip ${r.kind === "colloquio" ? "ds-chip-green" : r.kind === "rifiutata" ? "ds-chip-red" : "ds-chip-blue"}`}>{r.kind === "colloquio" ? "Colloquio" : r.kind === "rifiutata" ? "Rifiutata" : "Risposta"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 3 }}>{r.from}{r.subject ? ` · ${r.subject}` : ""}</div>
                    <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap", color: "var(--fg-muted)" }}>{r.body}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{fmtTime(r.date)}</div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ icon, title, sub, cta }: { icon: "send" | "check" | "inbox"; title: string; sub: string; cta?: { href: string; label: string } }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10, padding: 32 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))", display: "grid", placeItems: "center" }}><Icon name={icon} size={24} /></div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--fg-muted)", maxWidth: 440 }}>{sub}</div>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-primary" style={{ marginTop: 6 }}>{cta.label}</Link>}
    </div>
  );
}
