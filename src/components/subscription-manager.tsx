"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

type Reason = "too_expensive" | "found_job" | "not_useful" | "technical" | "other";
type Step = "reason" | "found_job" | "discount" | "pause" | "confirm" | "done";

interface SubState {
  status: string;
  cancelAtPeriodEnd: boolean;
  paused: boolean;
  pausedUntil: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  discount: { percentOff: number | null; name: string | null } | null;
}

const REVIEW_URL = process.env.NEXT_PUBLIC_REVIEW_URL || "https://it.trustpilot.com/evaluate/lavorai.it";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "");

const REASONS: { key: Reason; label: string; sub: string }[] = [
  { key: "too_expensive", label: "È troppo caro", sub: "Il prezzo non è sostenibile per me adesso" },
  { key: "found_job", label: "Ho trovato lavoro", sub: "Non ho più bisogno di candidarmi" },
  { key: "not_useful", label: "Non mi è stato utile", sub: "Poche risposte, annunci non adatti" },
  { key: "technical", label: "Problemi tecnici", sub: "Qualcosa non ha funzionato" },
  { key: "other", label: "Altro", sub: "Te lo spiego io" },
];

/**
 * Gestione abbonamento in Impostazioni: stato, pausa, cancellazione con
 * percorso guidato in base al motivo (sconto se è caro, congratulazioni +
 * recensione se ha trovato lavoro, pausa in alternativa alla cancellazione).
 */
export function SubscriptionManager({ planName }: { planName: string }) {
  const router = useRouter();
  const [sub, setSub] = useState<SubState | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<Reason | null>(null);
  const [foundViaUs, setFoundViaUs] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string>("");

  async function load() {
    const r = await fetch("/api/stripe/subscription").then((x) => x.json()).catch(() => ({}));
    setSub(r.subscription ?? null);
  }
  useEffect(() => { load(); }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await fetch("/api/stripe/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason, foundViaUs, comment, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message ?? "Operazione non riuscita."); return null; }
      await load();
      router.refresh();
      return j;
    } finally {
      setBusy(null);
    }
  }

  function startCancel() {
    setReason(null); setFoundViaUs(null); setComment(""); setStep("reason"); setOpen(true);
  }

  function next() {
    if (!reason) return;
    if (reason === "too_expensive") setStep(sub?.discount ? "confirm" : "discount");
    else if (reason === "found_job") setStep("found_job");
    else setStep("pause");
  }

  async function confirmCancel() {
    const j = await act("cancel");
    if (!j) return;
    setDoneMsg(reason === "found_job"
      ? `Abbonamento cancellato: resta attivo fino al ${fmt(j.until)}. In bocca al lupo per il nuovo lavoro!`
      : `Abbonamento cancellato: resta attivo fino al ${fmt(j.until)}. Puoi riattivarlo quando vuoi da questa pagina.`);
    setStep("done");
  }

  async function acceptDiscount() {
    const j = await act("discount");
    if (!j) return;
    setDoneMsg("Sconto applicato: -30% per i prossimi 3 mesi. Grazie per restare con noi.");
    setStep("done");
  }

  async function pause(months: number) {
    const j = await act("pause", { months });
    if (!j) return;
    setDoneMsg(`Abbonamento in pausa fino al ${fmt(j.pausedUntil)}: nessun addebito. Riprende da solo, o quando vuoi tu da qui.`);
    setStep("done");
  }

  if (sub === undefined) return <span className="ds-chip">Carico…</span>;
  if (sub === null) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {/* Stato sintetico */}
      <div style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "right" }}>
        {sub.paused ? <>In pausa fino al <b style={{ color: "var(--fg)" }}>{fmt(sub.pausedUntil)}</b></>
          : sub.cancelAtPeriodEnd ? <>Cancellazione programmata: attivo fino al <b style={{ color: "var(--fg)" }}>{fmt(sub.currentPeriodEnd)}</b></>
          : sub.status === "trialing" && sub.trialEnd ? <>Periodo gratuito fino al <b style={{ color: "var(--fg)" }}>{fmt(sub.trialEnd)}</b></>
          : sub.status === "past_due" ? <span style={{ color: "var(--amber)" }}>Pagamento non riuscito: aggiorna la carta</span>
          : sub.currentPeriodEnd ? <>Prossimo rinnovo il <b style={{ color: "var(--fg)" }}>{fmt(sub.currentPeriodEnd)}</b>{sub.discount?.percentOff ? ` · -${sub.discount.percentOff}% attivo` : ""}</> : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" className="ds-btn ds-btn-sm" onClick={async () => { const r = await fetch("/api/stripe/portal", { method: "POST" }).then((x) => x.json()).catch(() => ({})); if (r.url) window.location.href = r.url; else toast.error("Portale non disponibile."); }}>
          Carta e fatture
        </button>
        {sub.paused ? (
          <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={busy === "resume"} onClick={() => act("resume").then((j) => j && toast.success("Abbonamento riattivato."))}>{busy === "resume" ? "Riattivo…" : "Riprendi ora"}</button>
        ) : sub.cancelAtPeriodEnd ? (
          <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={busy === "undo_cancel"} onClick={() => act("undo_cancel").then((j) => j && toast.success("Cancellazione annullata."))}>{busy === "undo_cancel" ? "Annullo…" : "Annulla cancellazione"}</button>
        ) : (
          <>
            <button type="button" className="ds-btn ds-btn-sm" onClick={() => { setReason("other"); setStep("pause"); setOpen(true); }}>Metti in pausa</button>
            <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={startCancel}>Cancella</button>
          </>
        )}
      </div>

      {open && (
        <div role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="fit-card" style={{ width: "min(520px, 100%)", padding: "22px 24px", gap: 0, maxHeight: "90vh", overflow: "auto" }}>
            {step === "reason" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ci dispiace vederti andare</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>Ci dici il motivo? Ci aiuta a migliorare e forse abbiamo un&apos;alternativa per te.</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {REASONS.map((r) => (
                    <button key={r.key} type="button" onClick={() => setReason(r.key)} className="ds-btn" style={{ justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "10px 14px", borderColor: reason === r.key ? "hsl(var(--primary))" : undefined, boxShadow: reason === r.key ? "0 0 0 3px hsl(var(--primary)/0.2)" : undefined }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{r.sub}</span>
                    </button>
                  ))}
                </div>
                {reason === "other" || reason === "technical" || reason === "not_useful" ? (
                  <textarea className="fit-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Raccontaci cosa non ha funzionato (facoltativo)" style={{ marginTop: 12, resize: "vertical" }} />
                ) : null}
                <Footer onBack={() => setOpen(false)} backLabel="Chiudi" primary={{ label: "Continua", onClick: next, disabled: !reason }} />
              </>
            )}

            {step === "found_job" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Congratulazioni!</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>È la notizia migliore che potessimo ricevere. Una domanda sola: l&apos;hai trovato grazie a LavorAI?</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={`ds-btn ${foundViaUs === true ? "ds-btn-primary" : ""}`} onClick={() => setFoundViaUs(true)}>Sì, grazie a LavorAI</button>
                  <button type="button" className={`ds-btn ${foundViaUs === false ? "ds-btn-primary" : ""}`} onClick={() => setFoundViaUs(false)}>No, per altre vie</button>
                </div>
                {foundViaUs === true && (
                  <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "hsl(var(--primary)/0.10)", border: "1px solid hsl(var(--primary)/0.35)", fontSize: 13.5, lineHeight: 1.5 }}>
                    Siamo grati di aver fatto parte del tuo percorso. Se hai due minuti, una recensione aiuta altre persone a trovare lavoro come te.
                    <div style={{ marginTop: 10 }}>
                      <a href={REVIEW_URL} target="_blank" rel="noreferrer" className="ds-btn ds-btn-sm ds-btn-primary" onClick={() => void fetch("/api/stripe/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_clicked", reason: "found_job", foundViaUs: true }) })}>
                        <Icon name="star" size={12} /> Lascia una recensione
                      </a>
                    </div>
                  </div>
                )}
                {foundViaUs === false && <p style={{ marginTop: 12, fontSize: 13.5 }}>In bocca al lupo per il nuovo inizio. Se in futuro tornerai a cercare, i tuoi dati e le tue risposte ti aspettano qui.</p>}
                <textarea className="fit-input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Vuoi raccontarci dove? (facoltativo)" style={{ marginTop: 12, resize: "vertical" }} />
                <Footer onBack={() => setStep("reason")} primary={{ label: busy === "cancel" ? "Cancello…" : "Conferma cancellazione", onClick: confirmCancel, disabled: foundViaUs === null || !!busy }} />
              </>
            )}

            {step === "discount" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ti veniamo incontro</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>Capiamo. Invece di cancellare, ti offriamo il <b style={{ color: "var(--fg)" }}>30% di sconto per i prossimi 3 mesi</b>, applicato subito al tuo piano {planName}. Nessun vincolo: puoi comunque cancellare quando vuoi.</p>
                <div style={{ display: "grid", gap: 8 }}>
                  <button type="button" className="ds-btn ds-btn-primary" disabled={!!busy} onClick={acceptDiscount}>{busy === "discount" ? "Applico…" : "Accetto lo sconto del 30%"}</button>
                  <button type="button" className="ds-btn ds-btn-ghost" onClick={() => setStep("confirm")}>No grazie, voglio cancellare</button>
                </div>
                <Footer onBack={() => setStep("reason")} />
              </>
            )}

            {step === "pause" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Preferisci una pausa?</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>Metti in pausa l&apos;abbonamento: nessun addebito, i tuoi dati e le risposte restano salvati, e riparte da solo alla data scelta (o prima, se vuoi).</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[1, 2, 3].map((m) => (
                    <button key={m} type="button" className="ds-btn" disabled={!!busy} onClick={() => pause(m)}>{busy === "pause" ? "…" : `${m} ${m === 1 ? "mese" : "mesi"}`}</button>
                  ))}
                </div>
                {reason !== "other" || comment ? null : (
                  <textarea className="fit-input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Cosa possiamo migliorare? (facoltativo)" style={{ marginTop: 12, resize: "vertical" }} />
                )}
                <div style={{ marginTop: 14 }}>
                  <button type="button" className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => setStep("confirm")}>Preferisco cancellare</button>
                </div>
                <Footer onBack={() => setOpen(false)} backLabel="Chiudi" />
              </>
            )}

            {step === "confirm" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Confermi la cancellazione?</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>Il piano {planName} resta attivo fino alla fine del periodo già pagato{sub.currentPeriodEnd ? ` (${fmt(sub.currentPeriodEnd)})` : ""}, poi passi al piano gratuito. Nessun altro addebito. Puoi ripensarci fino ad allora.</p>
                <Footer onBack={() => setStep("reason")} primary={{ label: busy === "cancel" ? "Cancello…" : "Sì, cancella", onClick: confirmCancel, disabled: !!busy }} />
              </>
            )}

            {step === "done" && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Fatto</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 14px" }}>{doneMsg}</p>
                <Footer onBack={() => setOpen(false)} backLabel="Chiudi" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Footer({ onBack, backLabel = "Indietro", primary }: { onBack: () => void; backLabel?: string; primary?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18 }}>
      <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={onBack}>{backLabel}</button>
      {primary && <button type="button" className="ds-btn ds-btn-sm ds-btn-primary" disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</button>}
    </div>
  );
}
