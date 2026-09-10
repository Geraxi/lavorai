"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  createdAt: string;
  lastReplyAt: string | null;
  viewedAt: string | null;
  coverLetter: string | null;
  hasCv: boolean;
  answers: { label: string; answer: string; source: string }[];
  pending: { label: string; kind?: string; options?: string[] }[];
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

type Filter = "all" | "sent" | "waiting" | "replies" | "answers";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const fmtFull = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const SOURCE: Record<string, { label: string; cls: string }> = {
  user: { label: "Tua risposta", cls: "ds-chip-green" },
  profile: { label: "Dal profilo", cls: "ds-chip-blue" },
  rule: { label: "Automatica", cls: "ds-chip-blue" },
  ai: { label: "Risposta AI", cls: "ds-chip-amber" },
  assumed: { label: "Presunta · verifica", cls: "ds-chip-red" },
};

function cleanLabel(raw: string): string {
  const s = (raw || "").replace(/SVGs? not supported by this browser\.?/gi, " ").split(/\s*\+\d{1,4}[A-Z]/)[0].replace(/\s+/g, " ").replace(/^\*+|\*+$/g, "").trim();
  return s || raw.slice(0, 60);
}

function isConfirmed(s: InboxSent) {
  return s.status === "success" && (!!s.confirmation?.startsWith("DETECTED") || s.confirmation === "EMAIL_SENT");
}

function statusChip(s: InboxSent) {
  if (s.replyKind === "colloquio") return { label: "Colloquio", cls: "ds-chip-green" };
  if (s.replyKind === "rifiutata") return { label: "Rifiutata", cls: "ds-chip-red" };
  if (s.replyCount > 0) return { label: "Risposta ricevuta", cls: "ds-chip-blue" };
  if (s.status === "needs_answers") return { label: "Servono risposte", cls: "ds-chip-amber" };
  if (s.status === "ready_to_apply") return { label: "Da completare", cls: "ds-chip-amber" };
  if (isConfirmed(s)) return { label: s.confirmation === "EMAIL_SENT" ? "Email consegnata" : "Consegnata", cls: "ds-chip-green" };
  return { label: "Inviata", cls: "" };
}

/**
 * Inbox stile client di posta: lista conversazioni a sinistra (una per
 * candidatura), thread a destra con i messaggi in ordine cronologico:
 * candidatura inviata (lettera, risposte usate, CV), domande in sospeso
 * (rispondibili qui), risposte reali del recruiter.
 */
export function InboxView({ sent, answers, replies, waiting, forwardAddress }: { sent: InboxSent[]; answers: InboxAnswer[]; replies: InboxReply[]; waiting: number; forwardAddress?: string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(sent[0]?.id ?? null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localAnswers, setLocalAnswers] = useState(answers);
  const [editKey, setEditKey] = useState<string | null>(null);

  const repliesByApp = useMemo(() => {
    const m = new Map<string, InboxReply[]>();
    for (const r of replies) m.set(r.applicationId, [...(m.get(r.applicationId) ?? []), r]);
    return m;
  }, [replies]);

  const threads = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sent
      .filter((s) => {
        if (filter === "sent") return s.status === "success";
        if (filter === "waiting") return s.status !== "success";
        if (filter === "replies") return s.replyCount > 0;
        return true;
      })
      .filter((s) => !needle || `${s.company} ${s.title} ${s.portal}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.lastReplyAt ?? b.date).getTime() - new Date(a.lastReplyAt ?? a.date).getTime());
  }, [sent, filter, q]);

  useEffect(() => {
    if (filter !== "answers" && threads.length > 0 && !threads.some((t) => t.id === selected)) setSelected(threads[0].id);
  }, [threads, selected, filter]);

  const cur = sent.find((s) => s.id === selected) ?? null;
  const counts = {
    all: sent.length,
    sent: sent.filter((s) => s.status === "success").length,
    waiting: sent.filter((s) => s.status !== "success").length,
    replies: sent.filter((s) => s.replyCount > 0).length,
    answers: localAnswers.length,
  };

  async function submitAnswers(pairs: { labelKey: string; answer: string }[], msg: string) {
    if (pairs.length === 0 || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const r = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: pairs }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setNotice(j.requeued > 0 ? `${msg} ${j.requeued} ${j.requeued === 1 ? "candidatura ricandidata" : "candidature ricandidate"} in automatico.` : msg);
        setLocalAnswers((rows) => rows.map((x) => { const p = pairs.find((y) => y.labelKey === x.labelKey); return p ? { ...x, answer: p.answer, source: "user", answeredAt: new Date().toISOString() } : x; }));
        setEditKey(null);
        setDraft({});
        router.refresh();
      } else setNotice("Salvataggio non riuscito, riprova.");
    } finally {
      setSaving(false);
    }
  }

  const normalize = (label: string) => label.toLowerCase().replace(/[*]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

  const filters: { key: Filter; label: string; icon: "inbox" | "send" | "clock" | "sparkles" | "check" }[] = [
    { key: "all", label: "Tutte", icon: "inbox" },
    { key: "sent", label: "Inviate", icon: "send" },
    { key: "waiting", label: "In attesa", icon: "clock" },
    { key: "replies", label: "Risposte ricevute", icon: "sparkles" },
    { key: "answers", label: "Risposte salvate", icon: "check" },
  ];

  return (
    <div className="fit-page" style={{ gridTemplateColumns: "minmax(300px, 360px) minmax(0,1fr)", gridTemplateRows: "auto minmax(0,1fr)", gap: 14 }}>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="fit-h1">Inbox</h1>
          <p className="fit-hero-sub">Ogni candidatura è una conversazione: cosa abbiamo inviato a tuo nome, cosa ha risposto l&apos;azienda, cosa manca.</p>
        </div>
        {forwardAddress && (
          <div style={{ fontSize: 12, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Icon name="send" size={12} />
            Ricevuto una risposta sulla tua email? Inoltrala a
            <button type="button" className="ds-btn ds-btn-sm" style={{ padding: "2px 8px", fontFamily: "monospace", fontSize: 12 }} onClick={() => { try { navigator.clipboard.writeText(forwardAddress); setNotice("Indirizzo copiato."); } catch { /* ignore */ } }} title="Copia">
              {forwardAddress}
            </button>
            e la troverai qui.
          </div>
        )}
        {waiting > 0 && (
          <button type="button" className="ds-btn ds-btn-sm" onClick={() => setFilter("waiting")}>
            <Icon name="clock" size={12} /> {waiting} {waiting === 1 ? "candidatura aspetta" : "candidature aspettano"} una risposta
          </button>
        )}
      </div>

      {/* Colonna sinistra: filtri + lista */}
      <div className="fit-card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border-ds)", display: "grid", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: 9, color: "var(--fg-subtle)" }}><Icon name="search" size={13} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca azienda o ruolo…" className="fit-input" style={{ paddingLeft: 30, fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {filters.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`ds-btn ds-btn-sm ${filter === f.key ? "ds-btn-primary" : ""}`} style={{ padding: "4px 9px", fontSize: 12 }}>
                <Icon name={f.icon} size={11} /> {f.label} <span style={{ opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fit-body fit-scroll">
          {filter === "answers" ? (
            localAnswers.length === 0 ? (
              <EmptyList text="Nessuna risposta salvata." />
            ) : (
              [...localAnswers.filter((a) => !a.answer), ...localAnswers.filter((a) => a.answer)].map((a) => (
                <button key={a.id} type="button" onClick={() => setEditKey(a.labelKey)} style={{ ...rowStyle(editKey === a.labelKey), display: "block", width: "100%", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanLabel(a.label)}</span>
                    <span className={`ds-chip ${a.answer ? (SOURCE[a.source]?.cls ?? "") : "ds-chip-amber"}`} style={{ flexShrink: 0 }}>{a.answer ? (SOURCE[a.source]?.label ?? a.source) : "Manca"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: a.answer ? "var(--fg-muted)" : "var(--amber)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.answer || "Non ancora risposto"}</div>
                </button>
              ))
            )
          ) : threads.length === 0 ? (
            <EmptyList text={sent.length === 0 ? "Quando LavorAI invia una candidatura, la conversazione compare qui." : "Nessuna conversazione con questo filtro."} />
          ) : (
            threads.map((s) => {
              const chip = statusChip(s);
              const active = s.id === selected;
              const unread = !!s.lastReplyAt && (!s.viewedAt || new Date(s.lastReplyAt) > new Date(s.viewedAt));
              const preview = s.replyCount > 0 ? (repliesByApp.get(s.id)?.[0]?.body ?? "Risposta del recruiter") : s.status === "needs_answers" ? `${s.pending.length} ${s.pending.length === 1 ? "domanda richiede" : "domande richiedono"} una tua risposta` : s.coverLetter ? s.coverLetter.split(/\n/).find((l) => l.trim().length > 20) ?? "Candidatura inviata" : "Candidatura inviata";
              return (
                <button key={s.id} type="button" onClick={() => setSelected(s.id)} style={{ ...rowStyle(active), display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: 10, width: "100%", textAlign: "left" }}>
                  <CompanyLogo company={s.company} color={companyColor(s.company)} size={32} url={s.url} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: unread ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.company}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-subtle)", flexShrink: 0 }}>{fmtDay(s.lastReplyAt ?? s.date)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, minWidth: 0 }}>
                      <span className={`ds-chip ${chip.cls}`} style={{ flexShrink: 0 }}>{chip.label}</span>
                      <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</span>
                      {unread && <span className="ds-dot ds-dot-green" style={{ flexShrink: 0 }} aria-label="non letto" />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Colonna destra: thread */}
      <div className="fit-card" style={{ padding: 0 }}>
        {filter === "answers" ? (
          <AnswerEditor answers={localAnswers} editKey={editKey} draft={draft} setDraft={setDraft} saving={saving} notice={notice} onSave={(a, v) => submitAnswers([{ labelKey: a.labelKey, answer: v }], "Risposta salvata.")} onCancel={() => setEditKey(null)} />
        ) : !cur ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 13.5, padding: 32, textAlign: "center" }}>
            {sent.length === 0 ? <><div style={{ marginBottom: 10 }}><Icon name="inbox" size={28} /></div>Nessuna conversazione ancora. <Link href="/discover" className="ds-btn ds-btn-primary ds-btn-sm" style={{ marginTop: 12 }}>Trova opportunità</Link></> : "Seleziona una conversazione"}
          </div>
        ) : (
          <>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-ds)", display: "flex", alignItems: "center", gap: 12 }}>
              <CompanyLogo company={cur.company} color={companyColor(cur.company)} size={38} url={cur.url} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                  <span>{cur.company}{cur.location ? ` · ${cur.location}` : ""}</span>
                  <span className={`ds-chip ${statusChip(cur).cls}`}>{statusChip(cur).label}</span>
                  <span className="ds-chip">{cur.portal}</span>
                </div>
              </div>
              <a href={cur.url} target="_blank" rel="noreferrer" className="ds-btn ds-btn-sm" title="Apri annuncio"><Icon name="external" size={12} /> Annuncio</a>
              <Link href={`/applications?id=${cur.id}`} className="ds-btn ds-btn-sm" title="Dettagli">Dettagli</Link>
            </div>

            <div className="fit-body fit-scroll" style={{ padding: 18, gap: 14 }}>
              {notice && <div style={{ padding: "10px 12px", borderRadius: 10, background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.35)", fontSize: 13 }}>{notice}</div>}

              {/* 1. Il messaggio di candidatura (quello che abbiamo inviato a nome dell'utente) */}
              <Bubble from={cur.status === "success" ? `LavorAI → ${cur.company}` : `LavorAI (bozza per ${cur.company})`} time={fmtFull(cur.date)} tone={cur.status === "success" ? "mine" : "draft"}>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginBottom: 8 }}>
                  {cur.status === "success"
                    ? isConfirmed(cur) ? `Candidatura consegnata su ${cur.portal}: il portale ha confermato la ricezione.` : `Candidatura inviata su ${cur.portal} (senza conferma esplicita dal portale).`
                    : cur.status === "needs_answers" ? "Form compilato e pronto: manca solo la tua risposta alle domande qui sotto." : "Form pronto: completa l'invio dalla pagina Candidature."}
                </div>
                {cur.coverLetter && (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Lettera di presentazione</summary>
                    <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, margin: 0, color: "var(--fg)" }}>{cur.coverLetter}</p>
                  </details>
                )}
                {cur.answers.length > 0 && (
                  <details open={cur.status === "success"} style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Risposte date nel form ({cur.answers.length})</summary>
                    <div style={{ display: "grid", gap: 8 }}>
                      {cur.answers.map((a, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start", padding: "8px 10px", borderRadius: 8, background: "var(--bg-sunken)" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{cleanLabel(a.label)}</div>
                            <div style={{ fontSize: 13, marginTop: 2, whiteSpace: "pre-wrap" }}>{a.answer}</div>
                          </div>
                          <span className={`ds-chip ${SOURCE[a.source]?.cls ?? ""}`}>{SOURCE[a.source]?.label ?? a.source}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {cur.hasCv && <span className="ds-chip"><Icon name="file" size={10} /> CV allegato</span>}
                  {cur.coverLetter && <span className="ds-chip"><Icon name="file" size={10} /> Lettera</span>}
                  {cur.viewedAt && <span className="ds-chip ds-chip-blue">Aperta dal recruiter · {fmtDay(cur.viewedAt)}</span>}
                </div>
              </Bubble>

              {/* 2. Domande in sospeso: rispondibili qui */}
              {cur.status === "needs_answers" && cur.pending.length > 0 && (
                <Bubble from={`${cur.company} · form di candidatura`} time="in attesa" tone="them">
                  <div style={{ fontSize: 13, marginBottom: 10 }}>Il form richiede {cur.pending.length === 1 ? "una risposta" : `${cur.pending.length} risposte`} che solo tu puoi dare. Rispondi qui: la candidatura riparte da sola.</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {cur.pending.map((p, i) => {
                      const key = normalize(p.label);
                      const saved = localAnswers.find((a) => a.labelKey === key)?.answer ?? "";
                      return (
                        <div key={i}>
                          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>{cleanLabel(p.label)}</label>
                          {renderInput(p.kind ?? "text", p.options ?? [], draft[key] ?? saved, (v) => setDraft((d) => ({ ...d, [key]: v })), `pq-${cur.id}-${i}`)}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                    <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={saving} onClick={() => submitAnswers(cur.pending.map((p) => ({ labelKey: normalize(p.label), answer: (draft[normalize(p.label)] ?? "").trim() })).filter((x) => x.answer), "Risposte salvate.")}>
                      <Icon name="send" size={12} /> {saving ? "Invio…" : "Rispondi e invia candidatura"}
                    </button>
                  </div>
                </Bubble>
              )}

              {/* 3. Risposte reali del recruiter */}
              {(repliesByApp.get(cur.id) ?? []).slice().reverse().map((r) => (
                <Bubble key={r.id} from={r.from} time={fmtFull(r.date)} tone="them" chip={r.kind === "colloquio" ? { label: "Colloquio", cls: "ds-chip-green" } : r.kind === "rifiutata" ? { label: "Rifiutata", cls: "ds-chip-red" } : r.kind === "ricevuta" ? { label: "Candidatura ricevuta", cls: "ds-chip-blue" } : undefined}>
                  {r.subject && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{r.subject}</div>}
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{r.body}</p>
                </Bubble>
              ))}

              {cur.status === "success" && cur.replyCount === 0 && (
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", textAlign: "center", padding: "6px 0" }}>
                  {cur.via?.startsWith("portal_") ? "Le risposte per le candidature sui portali ATS arrivano direttamente alla tua email." : "Nessuna risposta ancora: le risposte del recruiter compaiono qui."}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return { padding: "11px 14px", borderBottom: "1px solid var(--border-ds)", background: active ? "var(--bg-sunken)" : "transparent", border: "none", borderBottomWidth: 1, borderBottomStyle: "solid", cursor: "pointer", color: "inherit", boxShadow: active ? "inset 3px 0 0 hsl(var(--primary))" : "none" };
}

function EmptyList({ text }: { text: string }) {
  return <div style={{ padding: 24, fontSize: 13, color: "var(--fg-muted)", textAlign: "center" }}>{text}</div>;
}

function Bubble({ from, time, tone, chip, children }: { from: string; time: string; tone: "mine" | "them" | "draft"; chip?: { label: string; cls: string }; children: React.ReactNode }) {
  const bg = tone === "mine" ? "var(--primary-weak)" : tone === "draft" ? "var(--bg-sunken)" : "var(--bg-elev)";
  return (
    <div style={{ padding: 14, border: `1px solid ${tone === "mine" ? "hsl(var(--primary)/0.35)" : "var(--border-ds)"}`, borderRadius: "var(--radius)", background: bg, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{from}</span>
          {chip && <span className={`ds-chip ${chip.cls}`}>{chip.label}</span>}
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-subtle)", flexShrink: 0 }}>{time}</span>
      </div>
      {children}
    </div>
  );
}

function AnswerEditor({ answers, editKey, draft, setDraft, saving, notice, onSave, onCancel }: { answers: InboxAnswer[]; editKey: string | null; draft: Record<string, string>; setDraft: (f: (d: Record<string, string>) => Record<string, string>) => void; saving: boolean; notice: string | null; onSave: (a: InboxAnswer, v: string) => void; onCancel: () => void }) {
  const a = answers.find((x) => x.labelKey === editKey) ?? null;
  if (!a) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 13.5, padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ marginBottom: 10 }}><Icon name="check" size={28} /></div>
          Le risposte salvate vengono riusate in ogni nuova candidatura.<br />Selezionane una a sinistra per vederla o modificarla.
        </div>
      </div>
    );
  }
  const v = draft[a.labelKey] ?? a.answer;
  const src = a.answer ? (SOURCE[a.source] ?? SOURCE.user) : { label: "Da rispondere", cls: "ds-chip-amber" };
  return (
    <div className="fit-body fit-scroll" style={{ padding: 18, gap: 12 }}>
      {notice && <div style={{ padding: "10px 12px", borderRadius: 10, background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.35)", fontSize: 13 }}>{notice}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{cleanLabel(a.label)}</div>
        <span className={`ds-chip ${src.cls}`} style={{ flexShrink: 0 }}>{src.label}</span>
      </div>
      {a.source === "ai" && a.answer && <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Questa risposta l&apos;ha scritta l&apos;AI dai dati del tuo CV. Se la modifichi, useremo sempre la tua versione.</div>}
      {a.source === "assumed" && a.answer && <div style={{ fontSize: 12.5, color: "var(--amber)" }}>Risposta dedotta in automatico (default prudente) per non bloccare la candidatura. Controllala: se la correggi, useremo sempre la tua versione.</div>}
      {renderInput(a.kind, a.options, v, (nv) => setDraft((d) => ({ ...d, [a.labelKey]: nv })), `ans-${a.id}`, true)}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={saving || !v.trim() || v.trim() === a.answer} onClick={() => onSave(a, v.trim())}>{saving ? "Salvo…" : "Salva"}</button>
        <button type="button" className="ds-btn ds-btn-sm" onClick={onCancel}>Chiudi</button>
      </div>
      {a.answeredAt && <div style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>Ultimo aggiornamento: {fmtFull(a.answeredAt)}</div>}
    </div>
  );
}

function renderInput(kind: string, options: string[], value: string, onChange: (v: string) => void, id: string, big = false) {
  if (kind === "select" || kind === "react-select" || kind === "radio") {
    return (
      <>
        <input list={options.length ? `dl-${id}` : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="fit-input" placeholder="Scrivi o scegli…" />
        {options.length > 0 && <datalist id={`dl-${id}`}>{options.map((o) => <option key={o} value={o} />)}</datalist>}
      </>
    );
  }
  if (kind === "checkbox") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="fit-input">
        <option value="">— scegli —</option>
        <option value="Yes">Sì / Accetto</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (kind === "textarea" || big || value.length > 80) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={big ? 6 : 3} className="fit-input" style={{ resize: "vertical" }} placeholder="La tua risposta…" />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className="fit-input" placeholder="La tua risposta…" />;
}
